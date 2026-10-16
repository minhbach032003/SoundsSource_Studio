import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const production = ['src/lib/petPreferences.ts','src/lib/petTray.ts'].map(path =>
  readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','')).join('\n');
const controls = readFileSync('src/components/pet/PetDisplaySettings.svelte','utf8');
const save = controls.slice(controls.indexOf('  async function save('),controls.indexOf('</script>'));
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve=done; }); return { promise,resolve }; };
function webview(storage, invoke) {
  const context = vm.createContext({invoke,isTauri:()=>true,window:{dispatchEvent(){}},StorageEvent:class {},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    toastState:{info(){},error(message){throw new Error(message);}}});
  vm.runInContext(ts.transpile(production+'\nlet prefs;\n'+save),context);
  return code => vm.runInContext(code,context);
}
function nativeFixture() {
  const sessions=[],writes=[]; let title;
  return {sessions,writes,get title(){return title;},
    invoke(name,args) {
      const pending=deferred();
      if(name==='get_agent_sessions')sessions.push(pending);
      else if(name==='update_tray_title')writes.push({title:args.title,finish(){title=args.title;pending.resolve();}});
      else throw new Error(`unexpected IPC ${name}`);
      return pending.promise;
    }};
}
const working=[{state:'working'}];

test('actual opposite count saves use latest persistence after reversed session responses and serialize native writes',async()=>{
  const storage=new Map([['ap_show_count','0']]),native=nativeFixture(),run=webview(storage,native.invoke);
  const enabled=run('save("count",true)'),disabled=run('save("count",false)');
  assert.equal(native.sessions.length,2);
  native.sessions[1].resolve(working); await flush();
  assert.equal(native.writes[0].title,'');
  native.sessions[0].resolve(working); await flush();
  assert.equal(native.writes.length,1,'queued native updates cannot finish out of order');
  native.writes[0].finish(); await flush();
  assert.equal(native.writes[1].title,'','older save must not restore its captured true');
  native.writes[1].finish(); await Promise.all([enabled,disabled]);
  assert.equal(storage.get('ap_show_count'),'0'); assert.equal(native.title,'');
});

test('opposite save while native write is pending repairs it before running the next queued update',async()=>{
  const storage=new Map(),native=nativeFixture(),run=webview(storage,native.invoke);
  const disabled=run('save("count",false)');native.sessions[0].resolve(working);await flush();
  const enabled=run('save("count",true)');native.sessions[1].resolve(working);await flush();
  assert.equal(native.writes.length,1);
  native.writes[0].finish();await flush();
  assert.equal(native.writes[1].title,'1','pending write repairs changed persistence');
  native.writes[1].finish();await flush();
  assert.equal(native.writes[2].title,'1');native.writes[2].finish();
  await Promise.all([enabled,disabled]);assert.equal(native.title,'1');
});

test('sibling popover and Settings writers converge when separate webview native responses complete backwards',async()=>{
  const storage=new Map([['ap_show_count','1']]),native=nativeFixture();
  const popover=webview(storage,native.invoke),main=webview(storage,native.invoke);
  const poll=popover('updatePetTrayCount([{state:"working"}])');await flush();
  assert.equal(native.writes[0].title,'1');
  const disabled=main('save("count",false)');native.sessions[0].resolve(working);await flush();
  native.writes[1].finish();await disabled;assert.equal(native.title,'');
  native.writes[0].finish();await flush();
  assert.equal(native.writes[2].title,'','older webview repairs its own stale native completion');
  native.writes[2].finish();await poll;assert.equal(native.title,'');
  const src=readFileSync('src/views/PetPopover.svelte','utf8');
  assert.match(src,/updatePetTrayCount\(sessList\)/,'periodic popover uses the shared native-write boundary');
  assert.doesNotMatch(src,/invoke\("update_tray_title"/,'no bypassing sibling native writes remain');
});
