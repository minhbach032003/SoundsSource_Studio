// Production App routing + Settings + sprite, across real same-origin browser windows.
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile), root = realpathSync(mkdtempSync(join(tmpdir(),'pet-settings-')));
const session = `pet-settings-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser',['--session',session,...args],{timeout:30000})).stdout;
const evaluate = async code => JSON.parse(await browser('eval',code));
let server;
try {
  symlinkSync(resolve('node_modules'),join(root,'node_modules'));
  symlinkSync(resolve('src'),join(root,'src')); symlinkSync(resolve('public'),join(root,'public'));
  writeFileSync(join(root,'App.svelte'),readFileSync('src/App.svelte','utf8'));
  writeFileSync(join(root,'window.js'),`export class LogicalSize {constructor(width,height){this.width=width;this.height=height;}}
    export const getCurrentWindow=()=>({setSize:async size=>{window.resizeRequests.push(size);if(window.rejectResize)throw new Error('resize fixture rejection');window.lastSize=size;},onMoved:async()=>()=>{},scaleFactor:async()=>1,outerPosition:async()=>({x:20,y:30})});`);
  writeFileSync(join(root,'Stub.svelte'),'<div></div>');
  writeFileSync(join(root,'spotify.js'),'export const spotifyState={start(){},loginVersion:0,status:null};');
  writeFileSync(join(root,'wallpaper.js'),'export const wallpaperState={backgroundStyle:{},wallpaper:{blur:0,dim:1}};');
  writeFileSync(join(root,'google.js'),'export const googleAuthState={user:null,isLoginModalOpen:false,isLoading:false};');
  writeFileSync(join(root,'toast.js'),`export const toastState=Object.fromEntries(['info','error','success'].map(kind=>[kind,message=>window.feedback.push([kind,message])]));`);
  writeFileSync(join(root,'ipc.js'),`export const isTauri=()=>true;export async function invoke(name,args){
    window.commands.push([name,args]);
    if(name==='is_pet_overlay_open')return window.nativeVisible;
    if(name==='toggle_pet_overlay'){window.nativeVisible=args.enable;return args.enable;}
    if(name==='get_agent_sessions'||name==='get_agent_integrations')return [];
    if(name==='toggle_pet_popover')throw new Error('use fallback care menu');
  }`);
  writeFileSync(join(root,'index.html'),'<html lang="en"><head><title>Pet settings test</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>');
  writeFileSync(join(root,'main.js'),`
    import { mount } from 'svelte';import App from './App.svelte';import Popover from '@/views/PetPopover.svelte';import Overlay from '@/views/PetOverlay.svelte';
    import { navigateTo } from '@/lib/navigation';import './src/styles.css';
    window.feedback=[];window.commands=[];window.nativeVisible=true;window.navigateTo=navigateTo;window.draws=[];window.resizeRequests=[];
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.isConnected)window.draws.push(args.slice(1,5));return draw.apply(this,args);};
    const mode=new URLSearchParams(location.search).get('mode');
    mount(mode==='popover'?Popover:mode==='overlay'?Overlay:App,{target:document.querySelector('#app')});
  `);
  const aliases = {
    '@/lib/spotify.svelte':join(root,'spotify.js'), '@/lib/wallpaper.svelte':join(root,'wallpaper.js'),
    '@/lib/googleAuth.svelte':join(root,'google.js'), '@/lib/toast.svelte':join(root,'toast.js'),
    '@tauri-apps/api/core':join(root,'ipc.js'), '@tauri-apps/api/window':join(root,'window.js'),
  };
  for (const path of ['views/SpotifyView.svelte','views/MixerView.svelte','views/VoiceAiView.svelte','views/SettingsView.svelte','views/TimerView.svelte','views/PingsWheelView.svelte',
    'components/audio/SpotifyPlayer.svelte','components/ThemeControls.svelte','components/ui/ToastHost.svelte','components/radial/GlobalPingHost.svelte','components/GoogleLoginModal.svelte',
    'components/pet/PetGallery.svelte','components/pet/PetSocketPanel.svelte','components/pet/PetActivityStream.svelte','components/ui/Modal.svelte']) aliases[`@/${path}`]=join(root,'Stub.svelte');
  aliases['@']=resolve('src');
  server=await createServer({configFile:false,root,plugins:[svelte({configFile:false}),tailwindcss()],resolve:{alias:aliases,dedupe:['svelte']},optimizeDeps:{exclude:['@lucide/svelte']},server:{port:0,host:'127.0.0.1',fs:{allow:[root,process.cwd()]}}});
  await server.listen(); const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  await browser('open',url);
  await browser('wait','main');
  assert.equal(await evaluate(`document.querySelector('main').getAttribute('aria-label')`),'Audio Mixer');
  await browser('eval',`window.navigateTo('pet')`);
  await browser('wait','--text','AgentPet Settings');
  await browser('eval',`window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('storage fixture rejection')};[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='AgentPet Settings').click()`);
  await browser('wait','#pet-size');
  assert.equal(await evaluate(`document.querySelector('main').getAttribute('aria-label')`),'AgentPet Settings');
  await browser('eval',`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Back to AgentPet').click()`);
  await browser('wait','--text','Companion Cockpit');
  assert.equal(await evaluate(`document.querySelector('main').getAttribute('aria-label')`),'Agent Pet Companion');
  await browser('eval',`Storage.prototype.setItem=window.originalSetItem`);
  console.log('PASS actual local Settings and Back clicks with rejected storage');
  // Same-window navigation from any current destination.
  await browser('eval',`document.querySelector('button[aria-label="Voice AI"]').click();window.navigateTo('pet-settings')`);
  await browser('wait','#pet-size');
  console.log('PASS actual App: AgentPet discoverability and current-window Settings routing');

  await browser('eval',`document.querySelector('button[aria-label="Spotify"]').click()`);
  await browser('tab','new',`${url}/?mode=popover`);
  await browser('wait','footer');
  await browser('eval',`window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('storage fixture rejection')};document.querySelector('footer button').click()`);
  assert.ok(await evaluate(`window.feedback.at(-1)[0]==='error' && window.feedback.at(-1)[1].includes('storage fixture rejection')`));
  assert.ok(await evaluate(`!window.commands.some(([name])=>name==='show_main_window'||name==='close_pet_popover')`),'popover must not pretend failed external routing succeeded');
  await browser('eval',`Storage.prototype.setItem=window.originalSetItem;document.querySelector('footer button').click()`);
  await browser('tab','t1');
  await browser('wait','#pet-size');
  assert.equal(await evaluate(`document.querySelector('main').getAttribute('aria-label')`),'AgentPet Settings');
  console.log('PASS reused mounted main: popover Settings overrides Spotify through native storage event');

  await browser('tab','new',`${url}/?mode=overlay`);
  await browser('wait','--fn','window.draws.length>2');
  const before = await evaluate('window.draws.length');
  await browser('tab','t1');
  await browser('eval',`document.getElementById('animate-pets').click();(()=>{const el=document.getElementById('pet-size');el.value=300;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await browser('tab','t3');
  const frozen = await evaluate('window.draws.length');
  await new Promise(r=>setTimeout(r,350));
  assert.equal(await evaluate('window.draws.length'),frozen,'cross-window freeze stops real canvas draws');
  assert.ok(frozen>=before);
  await browser('tab','t1');
  await browser('eval',`document.getElementById('animate-pets').click()`);
  await browser('tab','t3');
  await browser('wait','--fn',`window.draws.length>${frozen}`);
  console.log('PASS actual sprite: cross-window freeze and resume without remount');
  const oldRowY = await evaluate('window.draws.at(-1)[1]');
  await browser('tab','t1');
  await browser('eval',`localStorage.setItem('rust_sound_pet_slug','work-blue-cat');window.navigateTo('pet')`);
  await browser('wait','button[title="Clip 5"]');
  await browser('eval',`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Idle').click();document.querySelector('button[title="Clip 5"]').click()`);
  assert.equal(await evaluate(`document.querySelector('button[title="Clip 5"]').getAttribute('aria-pressed')`),'true','same-window binding selection updates');
  await browser('tab','t3');
  await browser('wait','--fn',`window.draws.at(-1)[1]!==${oldRowY}`);
  console.log('PASS actual picker and sprite: same-window binding selection and cross-window row refresh without mood change');
  await browser('tab','t1');
  await browser('eval',`window.navigateTo('pet-settings')`);
  await browser('wait','#pet-size');

  for (const size of [80,300]) {
    await browser('tab','t1');
    await browser('eval',`(()=>{const el=document.getElementById('pet-size');el.value=${size};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await browser('tab','t3');
    await browser('wait','--fn',`document.querySelector('canvas').style.width==='${size}px'`);
    const bounds = await evaluate('window.lastSize');
    await browser('set','viewport',String(bounds.width),String(bounds.height));
    await browser('eval',`document.querySelector('[title="AgentPet Desktop Companion (Click to pet, drag to move)"]').querySelector('[role=button]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
    await browser('wait','button[aria-label="Close care actions"]');
    const geometry=await evaluate(`(()=>{const canvas=document.querySelector('canvas'),menu=document.querySelector('button[aria-label="Close care actions"]').parentElement.parentElement,bubble=document.querySelector('#app > div > div');return [canvas,menu,bubble].map(el=>{const r=el.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width}})})()`);
    for(const box of geometry) assert.ok(box.top>=0 && box.left>=0 && box.right<=bounds.width && box.bottom<=bounds.height,`size ${size}: clipped ${JSON.stringify(box)} in ${JSON.stringify(bounds)}`);
    assert.equal(geometry[0].width,size);
    await browser('eval',`document.querySelector('button[aria-label="Close care actions"]').click()`);
  }
  // A denied native resize reports an actual visible error, not a success claim.
  await browser('eval',`window.rejectResize=true`);
  await browser('tab','t1');
  await browser('eval',`(()=>{const el=document.getElementById('pet-size');el.value=180;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await browser('tab','t3');
  await browser('wait','[role=alert]');
  assert.ok(await evaluate(`document.querySelector('[role=alert]').textContent.includes('resize fixture rejection')`));
  assert.equal(await evaluate(`window.feedback.at(-1)[0]`),'error');
  await browser('eval',`window.rejectResize=false`);
  await browser('tab','t1');
  await browser('eval',`(()=>{const el=document.getElementById('pet-size');el.value=300;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  console.log('PASS actual overlay: 80/300 size propagation, bubble/menu/canvas headroom, visible native resize rejection');

  // Close main, request Settings while absent, then create a fresh main webview.
  await browser('tab','close','t1');
  await browser('tab','t2');
  await browser('eval',`localStorage.setItem('rust_sound_active_area','voice');document.querySelector('footer button').click()`);
  await browser('tab','new',url);
  await browser('wait','#pet-size');
  assert.equal(await evaluate(`document.querySelector('main').getAttribute('aria-label')`),'AgentPet Settings');
  assert.equal(await evaluate(`document.getElementById('pet-size').value`),'300','new Settings reads saved cross-window size');
  assert.equal(await evaluate(`localStorage.getItem('rust_sound_navigation_request')`),null);
  await browser('eval',`document.getElementById('show-pet').click()`);
  assert.equal(await evaluate(`localStorage.getItem('rust_sound_show_desktop_pet')`),'false');
  assert.equal(await evaluate(`window.feedback.at(-1)[0]`),'info');
  console.log('PASS newly created main: pending Settings destination wins over saved Voice tab; real Settings native visibility boundary');
} finally {
  await browser('close').catch(()=>{}); await server?.close(); rmSync(root,{recursive:true,force:true});
}
