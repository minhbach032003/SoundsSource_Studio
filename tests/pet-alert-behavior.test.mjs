import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ['src/lib/petPreferences.ts','src/lib/petAudio.ts'].map(path => readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','')).join('\n');
function fixture(storage = new Map()) {
  const calls = [], errors = [], listeners = new Set();
  let permission = 'default', decoded = {duration:1,numberOfChannels:1,length:44100}, rejectStorage = false, decodeHook;
  const node = () => ({connect(){},start(){calls.push('play');},stop(){},frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}});
  const context = vm.createContext({window:{ AudioContext: class {state='running';currentTime=0;destination={};async resume(){this.state='running';}async decodeAudioData(){if(decodeHook)return decodeHook();return decoded;}createGain(){return node();}createOscillator(){return node();}createBufferSource(){return node();}},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn),dispatchEvent:e=>listeners.forEach(fn=>fn(e))},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(rejectStorage)throw Error('disk full');storage.set(key,String(value));}},
    StorageEvent:class {constructor(type,init){this.type=type;Object.assign(this,init);}},isTauri:()=>true,invoke:async(name,args)=>{calls.push([name,args]);if(name==='send_pet_notification')return;return permission;},toastState:{error:e=>errors.push(e)},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,ArrayBuffer,console,setTimeout,clearTimeout});
  vm.runInContext(ts.transpile(source),context);
  return {storage,calls,errors,context,run:code=>vm.runInContext(code,context),set permission(v){permission=v;},set decoded(v){decoded=v;},set rejectStorage(v){rejectStorage=v;},set decodeHook(v){decodeHook=v;}};
}
const file = (name='sound.wav',size=4,type='audio/wav') => ({name,size,type,arrayBuffer:async()=>new ArrayBuffer(size)});
test('all real chime callers respect independent per-kind mute, but previews bypass it; notifications never request background permission',async()=>{
  const f=fixture();f.run('writePetPreference("doneSound",false);writePetPreference("notifications",false)');
  assert.equal(await f.run('playPetDoneChime()'),false);
  assert.equal(await f.run('playPetWaitingChime()'),true);
  assert.equal(await f.run('playPetSound("done",true)'),true);
  assert.equal(await f.run('sendDesktopNotification("Done","body")'),false);
  f.run('writePetPreference("notifications",true)');
  assert.equal(await f.run('sendDesktopNotification("Done","body")'),false);
  assert.ok(!f.calls.some(call=>call[0]==='request_pet_notification_permission'));
  f.permission='denied';assert.equal(await f.run('petNotificationPermission(true)'),'denied');
  f.permission='granted';assert.equal(await f.run('sendDesktopNotification("Done","body")'),true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))),['send_pet_notification',{title:'Done',body:'body'}]);
  const other=fixture(f.storage);assert.equal(await other.run('playPetDoneChime()'),false,'new webview reads shared settings');
});
test('upload boundary rejects type/size/decode/duration/storage failure, protects async races and persists/reset per kind',async()=>{
  const f=fixture();
  for(const bad of [file('x.txt'),file('x.wav',524289),file('x.wav',0),file('x.wav',4,'text/plain')]) {
    f.context.file=bad;await assert.rejects(f.run('uploadPetSound("done",file)'));
  }
  f.context.file=file();f.decoded={duration:16,numberOfChannels:1,length:1};await assert.rejects(f.run('uploadPetSound("done",file)'),/15 seconds/);
  f.decodeHook=async()=>{throw Error('invalid codec');};await assert.rejects(f.run('uploadPetSound("done",file)'),/cannot be decoded/);
  f.decodeHook=null;f.decoded={duration:1,numberOfChannels:1,length:44100};f.rejectStorage=true;
  await assert.rejects(f.run('uploadPetSound("done",file)'),/disk full/);assert.equal(f.storage.has('ap_sound_done_custom'),false);
  f.rejectStorage=false;await f.run('uploadPetSound("done",file)');assert.equal(f.run('petSoundName("done")'),'sound.wav');
  const other=fixture(f.storage);assert.equal(other.run('petSoundName("done")'),'sound.wav');assert.equal(await other.run('playPetSound("done",true)'),true);
  let finish;f.decodeHook=()=>new Promise(resolve=>{finish=resolve;});const pending=f.run('uploadPetSound("done",file)');
  await new Promise(resolve=>setImmediate(resolve));other.run('resetPetSound("done")');finish({duration:1,numberOfChannels:1,length:44100});
  await assert.rejects(pending,/changed while uploading/);assert.equal(f.run('petSoundName("done")'),'Synthesized default');
  assert.equal(f.run('petSoundName("waiting")'),'Synthesized default');
  f.storage.set('ap_sound_done_custom',JSON.stringify({name:'remote',data:'https://example.com/a.wav'}));
  await assert.rejects(f.run('playPetSound("done",true)'),/invalid/);
});
test('deferred resume rechecks both default sound mutes across webviews, while previews bypass mute',async()=>{
  for (const kind of ['done','waiting']) {
    for (const preview of [false,true]) {
      const f=fixture(),other=fixture(f.storage);
      // Create the production context without scheduling a sound, then suspend it.
      f.run('getAudioContext();audioCtx.state="suspended"');
      let finish;
      f.context.resume=()=>new Promise(resolve=>{finish=()=>{f.run('audioCtx.state="running"');resolve();};});
      f.run('audioCtx.resume=resume');
      const pending=f.run(`playPetSound("${kind}",${preview})`);
      other.run(`writePetPreference("${kind}Sound",false)`);
      finish();
      assert.equal(await pending,preview,`${kind}: mute changed during resume; preview=${preview}`);
      assert.equal(f.calls.filter(call=>call==='play').length,preview?(kind==='done'?3:2):0);
    }
  }
});
test('blocked autoplay resume fails actionably instead of leaving preview pending',async()=>{
  const f=fixture();
  await f.run('playPetSound("done",true)');
  f.context.setTimeout=callback=>setTimeout(callback,0);
  f.run('audioCtx.state="suspended";audioCtx.resume=()=>new Promise(()=>{})');
  await assert.rejects(f.run('playPetSound("done",true)'),/Audio is blocked/);
});
test('native commands restrict window labels, validate inputs and never authorize from send',()=>{
  const app=readFileSync('crates/app/src/lib.rs','utf8'),native=readFileSync('crates/core/src/pet_notifications.rs','utf8');
  assert.match(app,/window.label\(\) == "main"/);assert.match(app,/!request && window.label\(\) == "pet-overlay"/);
  assert.match(app,/title.chars\(\).count\(\) > 200/);assert.match(app,/body.chars\(\).count\(\) > 1000/);
  assert.ok(!native.includes('setSound('));assert.ok(!native.slice(native.indexOf('pub async fn send')).includes('requestAuthorization'));
  assert.match(native,/UNAuthorizationOptions::Alert/);
  assert.match(native,/UNNotificationPresentationOptions::Banner/);
  assert.ok(!native.includes('UNNotificationPresentationOptions::Sound'));
});
