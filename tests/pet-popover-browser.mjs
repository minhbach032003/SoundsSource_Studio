// Mounted actual Svelte component, real browser DOM; only IPC/toast boundaries stubbed.
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'pet-mounted-')));
const session = `pet-verify-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session',session,...args], {timeout:30000})).stdout;
let server;
try {
  symlinkSync(resolve('node_modules'),join(root,'node_modules'));
  writeFileSync(join(root,'Popover.svelte'),readFileSync('src/views/PetPopover.svelte','utf8'));
  writeFileSync(join(root,'petVisibility.ts'),readFileSync('src/lib/petVisibility.ts','utf8'));
  writeFileSync(join(root,'types.ts'),readFileSync('src/components/pet/types.ts','utf8'));
  writeFileSync(join(root,'Toast.svelte'),'<div data-toasts>Test toast boundary</div>');
  writeFileSync(join(root,'toast.js'),`export const toastState = Object.fromEntries(['info','error','success'].map(kind=>[kind,message=>window.feedback.push([kind,message])]));`);
  writeFileSync(join(root,'ipc.js'),`export const isTauri=()=>true;
    export async function invoke(name,args) {
      if(name==='is_pet_overlay_open') return window.nativeVisible;
      if(name==='get_agent_sessions') return [];
      if(name==='get_pet_care_state') return null;
      if(name==='toggle_pet_overlay') {window.requests.push(args.enable); if(window.rejectVisibility) throw new Error('native fixture rejection'); window.nativeVisible=args.enable; return args.enable;}
    }`);
  writeFileSync(join(root,'index.html'),'<div id="app"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(root,'main.js'),`
    import { mount } from 'svelte'; import Popover from './Popover.svelte';
    window.feedback=[]; window.requests=[]; window.nativeVisible=true; window.rejectVisibility=true;
    mount(Popover,{target:document.querySelector('#app')});
  `);
  const aliases = {
    '@/lib/petVisibility':join(root,'petVisibility.ts'),
    '@/lib/toast.svelte':join(root,'toast.js'),
    '@/components/ui/ToastHost.svelte':join(root,'Toast.svelte'),
    '@/components/pet/types':join(root,'types.ts'),
    '@tauri-apps/api/core':join(root,'ipc.js'),
  };
  server=await createServer({configFile:false,root,plugins:[svelte({configFile:false})],resolve:{alias:aliases,dedupe:['svelte']},optimizeDeps:{exclude:['@lucide/svelte']},server:{port:0,host:'127.0.0.1'}});
  await server.listen();
  const port=server.httpServer.address().port;
  await browser('open',`http://127.0.0.1:${port}`);
  await browser('wait','input[type=checkbox]').catch(async error=>{console.error(await browser('errors')); console.error(await browser('snapshot')); throw error;});
  const state=async()=>JSON.parse(await browser('eval',`({checked:document.querySelector('input[type=checkbox]').checked,requests:window.requests,feedback:window.feedback,saved:localStorage.getItem('rust_sound_show_desktop_pet')})`));
  assert.equal((await state()).checked,true);
  await browser('eval',"document.querySelector('input[type=checkbox]').click()");
  // The same native poll value must not leave an optimistic DOM toggle stale.
  await new Promise(r=>setTimeout(r,1700));
  let actual=await state();
  assert.equal(actual.checked,true,'failed hide must leave mounted checkbox checked after polling');
  assert.deepEqual(actual.requests,[false]);
  assert.equal(actual.saved,null);
  assert.equal(actual.feedback.at(-1)[0],'error');
  await browser('eval',"document.querySelector('input[type=checkbox]').click()");
  actual=await state(); assert.equal(actual.checked,true); assert.deepEqual(actual.requests,[false,false]);
  await browser('eval','window.rejectVisibility=false');
  await browser('eval',"document.querySelector('input[type=checkbox]').click()");
  actual=await state(); assert.equal(actual.checked,false); assert.equal(actual.saved,'false');
  assert.equal(actual.feedback.at(-1)[0],'info');
  await browser('eval','window.nativeVisible=true');
  await new Promise(r=>setTimeout(r,1700));
  assert.equal((await state()).checked,true,'poll reflects changes from the other window');
  console.log('PASS mounted Popover: rejection + same-value poll + repeat click + success persistence + external visibility poll');
} finally {
  await browser('close').catch(()=>{});
  await server?.close(); rmSync(root,{recursive:true,force:true});
}
