import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real view handler, not a copied formula. Imports are supplied at
// the IPC/storage/toast boundary so a native rejection is deterministic.
function handler(invoke) {
  const source = readFileSync('src/views/AgentPetView.svelte', 'utf8');
  const body = source.slice(source.indexOf('export async function open_pet_overlay_window'), source.indexOf('  function handleToggleDesktopOverlay'));
  const saved = new Map([['rust_sound_show_desktop_pet', 'false']]);
  const feedback = [];
  const context = vm.createContext({ invoke, isDesktop: true, showDesktopOverlay: false,
    localStorage: { getItem: k => saved.get(k) ?? null, setItem: (k,v) => saved.set(k,v) },
    toastState: Object.fromEntries(['info','success','error'].map(k=>[k, m=>feedback.push([k,m])])) });
  // The shared module (once introduced) is evaluated with exactly the same boundaries.
  try {
    const shared = readFileSync('src/lib/petVisibility.ts','utf8').replace(/^import .*;$/gm,'');
    vm.runInContext(ts.transpile(shared.replaceAll('export ', ''), { module: ts.ModuleKind.None }), context);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  vm.runInContext(ts.transpile(body.replace('export ', ''), { module: ts.ModuleKind.None }), context);
  return { context, saved, feedback };
}

test('native visibility failure does not persist, claim success, or flip the toggle', async () => {
  const h = handler(async () => { throw new Error('native show failed'); });
  await h.context.open_pet_overlay_window(true);
  assert.equal(h.saved.get('rust_sound_show_desktop_pet'), 'false');
  assert.equal(h.context.showDesktopOverlay, false);
  assert.equal(h.feedback.length, 1);
  assert.equal(h.feedback[0][0], 'error');
});

test('successful visibility change persists actual returned native state', async () => {
  const h = handler(async () => true);
  await h.context.open_pet_overlay_window(true);
  assert.equal(h.saved.get('rust_sound_show_desktop_pet'), 'true');
  assert.equal(h.context.showDesktopOverlay, true);
});

test('startup restores on the shell path and defaults visible, retaining saved coordinates', async () => {
  const source = readFileSync('src/lib/petVisibility.ts', 'utf8').replace(/^import .*;$/gm, '').replaceAll('export ', '');
  for (const pref of [null, 'true', 'false']) {
    const calls=[];
    const saved=new Map([['rust_sound_pet_overlay_pos', '{"x":42,"y":70}']]);
    if(pref!==null) saved.set('rust_sound_show_desktop_pet',pref);
    const context=vm.createContext({invoke:async (command,args)=>{calls.push([command,args]);return args.enable;},
      localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)}});
    vm.runInContext(ts.transpile(source),context);
    await context.restoreDesktopPet();
    assert.equal(calls.length,1);
    assert.equal(calls[0][1].enable,pref!=='false');
    assert.equal(calls[0][1].x,42);
    assert.equal(calls[0][1].y,70);
  }
});

test('actual main shell mount restores the pet without mounting the Pet tab', async()=> {
  const app=readFileSync('src/App.svelte','utf8');
  const start=app.indexOf('  onMount(');
  const mount=app.slice(start,app.indexOf('  import SideNavbar',start));
  const shared=readFileSync('src/lib/petVisibility.ts','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
  const calls=[]; let mounted;
  const context=vm.createContext({isTauri:()=>true,onMount:fn=>mounted=fn,
    invoke:async (command,args)=>{calls.push(command);return args.enable;},
    localStorage:{getItem:()=>null,setItem:()=>{}},toastState:{error:message=>assert.fail(message)}});
  vm.runInContext(ts.transpile(shared+'\n'+mount),context);
  mounted(); await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(calls,['toggle_pet_overlay']);
});
