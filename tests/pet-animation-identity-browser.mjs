// Production App/Gallery/picker/overlay with real sprites, controlled image delivery and native IPC stubs.
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile), root = realpathSync(mkdtempSync(join(tmpdir(),'pet-identity-')));
const session = `pet-identity-${process.pid}`;
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
    import { mount, unmount } from 'svelte';import App from './App.svelte';import Popover from '@/views/PetPopover.svelte';import Overlay from '@/views/PetOverlay.svelte';
    import { navigateTo } from '@/lib/navigation';import { PetRenderer } from '@/shared/lib/petRenderer';import './src/styles.css';
    window.newRenderer=()=>{const cv=document.createElement('canvas');document.body.append(cv);window.testCanvas=cv;return new PetRenderer(cv,'work-blue-cat');};
    window.feedback=[];window.commands=[];window.nativeVisible=true;window.navigateTo=navigateTo;window.draws=[];window.resizeRequests=[];
    localStorage.setItem('ap_animate_pets','0');
    if(!location.search){localStorage.clear();localStorage.setItem('ap_animate_pets','0');localStorage.setItem('rust_sound_active_area','pet');localStorage.setItem('rust_sound_pet_slug','code-frenzy-cat');}
    window.lastDraw=new WeakMap();window.pending=[];window.assetDraws=0;
    const NativeImage=window.Image;
    window.Image=function(){
      const img=new NativeImage();let load,error;
      Object.defineProperty(img,'onload',{get:()=>load,set:v=>load=v});
      Object.defineProperty(img,'onerror',{get:()=>error,set:v=>error=v});
      img.addEventListener('load',()=>{const callback=load; if(!callback)return;const finish=()=>callback.call(img,new Event('load'));if(window.holdSlug&&img.src.includes('/'+window.holdSlug+'/'))window.pending.push(finish);else finish();});
      img.addEventListener('error',()=>error?.call(img,new Event('error')));
      const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
      Object.defineProperty(img,'src',{get:()=>descriptor.get.call(img),set:value=>{
        const fail=window.failSlug&&value.includes('/'+window.failSlug+'/') || window.failOnceSlug&&value.includes('/'+window.failOnceSlug+'/');
        if(window.failOnceSlug&&value.includes('/'+window.failOnceSlug+'/'))window.failOnceSlug=null;
        descriptor.set.call(img,fail?'/missing-fixture.webp':value);
      }});
      return img;
    };
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){window.assetDraws++;if(this.canvas.isConnected){const record={src:args[0].src,rect:args.slice(1,5)};window.draws.push(record);window.lastDraw.set(this.canvas,record);}return draw.apply(this,args);};
    const mode=new URLSearchParams(location.search).get('mode');
    const app=mount(mode==='popover'?Popover:mode==='overlay'?Overlay:App,{target:document.querySelector('#app')});window.dispose=()=>unmount(app);
  `);
  const aliases = {
    '@/lib/spotify.svelte':join(root,'spotify.js'), '@/lib/wallpaper.svelte':join(root,'wallpaper.js'),
    '@/lib/googleAuth.svelte':join(root,'google.js'), '@/lib/toast.svelte':join(root,'toast.js'),
    '@tauri-apps/api/core':join(root,'ipc.js'), '@tauri-apps/api/window':join(root,'window.js'),
  };
  for (const path of ['views/SpotifyView.svelte','views/MixerView.svelte','views/VoiceAiView.svelte','views/SettingsView.svelte','views/TimerView.svelte','views/PingsWheelView.svelte',
    'components/audio/SpotifyPlayer.svelte','components/ThemeControls.svelte','components/ui/ToastHost.svelte','components/radial/GlobalPingHost.svelte','components/GoogleLoginModal.svelte',
    'components/pet/PetSocketPanel.svelte','components/pet/PetActivityStream.svelte','components/ui/Modal.svelte']) aliases[`@/${path}`]=join(root,'Stub.svelte');
  aliases['@']=resolve('src');
  server=await createServer({configFile:false,root,plugins:[svelte({configFile:false}),tailwindcss()],resolve:{alias:aliases,dedupe:['svelte']},optimizeDeps:{exclude:['@lucide/svelte']},server:{port:0,host:'127.0.0.1',fs:{allow:[root,process.cwd()]}}});
  await server.listen(); const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  await browser('open',url);
  await browser('wait','button[title="Clip 9"]');
  const clips = `Array.from(document.querySelectorAll('button[title^="Clip "] canvas'))`;
  const identities = `${clips}.map(cv=>window.lastDraw.get(cv)?.src.split('/').at(-2))`;
  const equip = async name => {await browser('eval', `document.querySelector('button[title^="${name} —"]').click()`);};
  const state = async name => browser('eval', `[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='${name}').click()`);
  const bind = async n => browser('eval', `document.querySelector('button[title="Clip ${n}"]').click()`);
  const settle = () => new Promise(r=>setTimeout(r,180));
  const failures=[];
  const check=async(name,fn)=>{try{await fn();console.log('PASS '+name);}catch(error){failures.push(name+': '+error.message);console.error('FAIL '+name+': '+error.message);}};
  await check('same-row-count Gallery switch redraws every production picker canvas', async()=>{
    assert.equal(await evaluate(`${clips}.length`),9);
    await equip('Cyber Coding Cat'); await settle();
    assert.deepEqual(await evaluate(identities),Array(9).fill('work-blue-cat'));
  });
  await check('bindings remain isolated by pet and state and restore on return',async()=>{
    await state('Working'); await bind(3); await state('Idle'); await bind(5);
    await equip('Code Frenzy Cat'); await settle(); await state('Working'); await bind(2);
    assert.equal(await evaluate(`localStorage.getItem('ap_bind_work-blue-cat_working')`),'2');
    assert.equal(await evaluate(`localStorage.getItem('ap_bind_work-blue-cat_idle')`),'4');
    assert.equal(await evaluate(`localStorage.getItem('ap_bind_code-frenzy-cat_working')`),'1');
    await equip('Cyber Coding Cat'); await settle();
    assert.equal(await evaluate(`document.querySelector('button[title="Clip 3"]').getAttribute('aria-pressed')`),'true');
  });
  await check('loading switch removes previous-pet selectable clips; late completion cannot win',async()=>{
    await browser('eval', `window.holdSlug='code-frenzy-cat'`);await equip('Code Frenzy Cat');
    await browser('wait','--fn',`window.pending.length>0`);
    assert.equal(await evaluate(`${clips}.length`),0,'old clips must disappear while new asset loads');
  });
  await equip('Cyber Coding Cat');await settle();
  const drawsBeforeLate=await evaluate('window.assetDraws');
  await browser('eval',`window.holdSlug=null;window.pending.splice(0).forEach(f=>f())`);await settle();
  await check('out-of-order delayed image callbacks cannot replace latest pet',async()=>{
    assert.deepEqual(await evaluate(identities),Array(9).fill('work-blue-cat'));
    assert.equal(await evaluate('window.assetDraws'),drawsBeforeLate,'obsolete callbacks must not slice or draw');
  });
  await check('rapid A/B/A switches invalidate all older generations, even the same slug',async()=>{
    await browser('eval',`window.holdSlug='code-frenzy-cat'`);await equip('Code Frenzy Cat');
    await browser('wait','--fn',`window.pending.length>0`);
    await browser('eval',`window.holdSlug='work-blue-cat'`);await equip('Cyber Coding Cat');
    await browser('wait','--fn',`window.pending.length>=4`);
    await browser('eval',`window.holdSlug=null`);await equip('Code Frenzy Cat');await settle();
    const before=await evaluate('window.assetDraws');
    await browser('eval',`window.pending.splice(0).reverse().forEach(f=>f())`);await settle();
    assert.deepEqual(await evaluate(identities),Array(9).fill('code-frenzy-cat'));
    assert.equal(await evaluate('window.assetDraws'),before,'older generations cannot draw even if their slug matches');
    await equip('Cyber Coding Cat');await settle();
  });
  await check('broken asset shows an error without stale selectable clips, then recovers',async()=>{
    await browser('eval',`window.failSlug='code-frenzy-cat'`);await equip('Code Frenzy Cat');await settle();
    assert.equal(await evaluate(`${clips}.length`),0);
    assert.ok(await evaluate(`document.body.textContent.includes('Could not load animation clips for code-frenzy-cat')`));
  });
  await browser('eval',`window.failSlug=null`);await equip('Cyber Coding Cat');await settle();
  await check('recovery after failure uses only selected pet',async()=>assert.deepEqual(await evaluate(identities),Array(9).fill('work-blue-cat')));
  await check('keyboard preview pauses offscreen and under reduced motion, then resumes',async()=>{
    await browser('eval',`localStorage.setItem('ap_animate_pets','1');window.dispatchEvent(new StorageEvent('storage',{key:'ap_animate_pets'}));document.querySelector('button[title="Clip 2"]').focus()`);
    const count=`window.draws.filter(record=>record.rect[1]===window.lastDraw.get(document.querySelector('button[title="Clip 2"] canvas')).rect[1]).length`;
    const before=await evaluate(count);
    await browser('wait','--fn',`${count}>${before}`);
    await browser('eval',`document.querySelector('button[title="Clip 2"]').style.transform='translateY(2000px)'`);
    await settle(); const paused=await evaluate(count); await settle();
    assert.equal(await evaluate(count),paused,'focused offscreen preview must stop drawing');
    await browser('eval',`document.querySelector('button[title="Clip 2"]').style.transform=''`);
    await browser('wait','--fn',`${count}>${paused}`);
    await browser('set','media','dark','reduced-motion');
    await settle(); const reduced=await evaluate(count); await settle();
    assert.equal(await evaluate(count),reduced,'reduced motion must stop focused preview');
    await browser('set','media','dark');
    await browser('wait','--fn',`${count}>${reduced}`);
    await browser('eval',`document.activeElement.blur();localStorage.setItem('ap_animate_pets','0');window.dispatchEvent(new StorageEvent('storage',{key:'ap_animate_pets'}))`);
  });
  await check('3D preview and desktop share smooth CSS sampling; pixel pets stay crisp',async()=>{
    await equip('Sword & Shield Guardian');
    await browser('wait','--fn',`${identities}.every(slug=>slug==='wode-daodun-3d') && ${clips}.length===9`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('button[title="Clip 1"] canvas')).imageRendering`),'auto');
    await equip('Cyber Coding Cat');await settle();
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('button[title="Clip 1"] canvas')).imageRendering`),'pixelated');
  });
  await browser('tab','new',url+'/?mode=overlay');
  await browser('wait','--fn',`window.draws.length>0`);
  await check('desktop consumes current pet + active idle row through real cross-window storage',async()=>{
    assert.equal(await evaluate(`window.draws.at(-1).src.split('/').at(-2)`),'work-blue-cat');
    const oldY=await evaluate('window.draws.at(-1).rect[1]');
    await browser('tab','t1');await state('Idle');await bind(6);
    await browser('tab','t2');await settle();
    assert.notEqual(await evaluate('window.draws.at(-1).rect[1]'),oldY);
    await browser('tab','t1');await equip('Code Frenzy Cat');await settle();
    await browser('tab','t2');await settle();
    assert.equal(await evaluate(`window.draws.at(-1).src.split('/').at(-2)`),'code-frenzy-cat');
  });
  await browser('tab','t1');
  await check('renderer repeated loads reject late success',async()=>{
    await browser('eval',`window.holdSlug='code-frenzy-cat';window.testRenderer=window.newRenderer();window.testRenderer.load('/pets/code-frenzy-cat/spritesheet.webp')`);
    await browser('wait','--fn','window.pending.length>0');
    await browser('eval',`window.testRenderer.load('/pets/work-blue-cat/spritesheet.webp')`);await settle();
    await browser('eval',`window.holdSlug=null;window.pending.splice(0).forEach(f=>f())`);await settle();
    assert.equal(await evaluate(`window.draws.at(-1).src.split('/').at(-2)`),'work-blue-cat');
    await browser('eval',`window.testRenderer.destroy()`);
  });
  await check('renderer clears previous pixels while loading and ignores late fallback success',async()=>{
    await browser('eval',`window.testRenderer=window.newRenderer();window.testRenderer.load('/pets/work-blue-cat/spritesheet.webp')`);await settle();
    assert.ok(await evaluate(`window.testCanvas.getContext('2d').getImageData(0,0,300,150).data.some(v=>v)`));
    await browser('eval',`window.holdSlug='code-frenzy-cat';window.failOnceSlug='code-frenzy-cat';window.testRenderer.load('/pets/code-frenzy-cat/spritesheet.webp')`);
    await browser('wait','--fn','window.pending.length>0');
    assert.ok(await evaluate(`window.testCanvas.getContext('2d').getImageData(0,0,window.testCanvas.width,window.testCanvas.height).data.every((v,i)=>i%4!==3||v===0)`),'loading must clear old pet pixels: '+JSON.stringify(await evaluate(`({loaded:window.testRenderer.loaded,src:window.testRenderer.img.src,pending:window.pending.length,width:window.testCanvas.width,height:window.testCanvas.height})`)));
    await browser('eval',`window.testRenderer.load('/pets/work-blue-cat/spritesheet.webp')`);await settle();
    const before=await evaluate('window.assetDraws');
    await browser('eval',`window.holdSlug=null;window.pending.splice(0).forEach(f=>f())`);await settle();
    assert.equal(await evaluate('window.assetDraws'),before,'obsolete fallback cannot draw');
    assert.equal(await evaluate(`window.draws.at(-1).src.split('/').at(-2)`),'work-blue-cat');
    await browser('eval',`window.testRenderer.destroy()`);
  });
  await browser('eval',`window.testRenderer.destroy();window.pending.splice(0);window.holdSlug='work-blue-cat'`);await equip('Cyber Coding Cat');
  await browser('wait','--fn',`window.pending.length>0`);
  await browser('eval',`(async()=>{await window.dispose();window.draws=[];window.assetDraws=0;window.pending.splice(0).forEach(f=>f())})()`);await settle();
  await check('unmount invalidates pending image completions',async()=>{
    assert.equal(await evaluate('window.draws.length'),0);
    assert.equal(await evaluate('window.assetDraws'),0,'unmounted picker must not slice even offscreen');
  });
  assert.deepEqual(failures,[]);
} finally {
  await browser('close').catch(()=>{}); await server?.close(); rmSync(root,{recursive:true,force:true});
}
