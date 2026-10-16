// Actual component, production CSS and theme in a native-sized browser; IPC/toast stubbed.
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'pet-mounted-')));
const session = `pet-verify-${process.pid}`;
const screenshots = mkdtempSync(join(tmpdir(), 'pet-popover-screenshots-'));
const browser = async (...args) => (await exec('agent-browser', ['--session',session,...args], {timeout:30000})).stdout;
let server;
try {
  symlinkSync(resolve('node_modules'),join(root,'node_modules'));
  symlinkSync(resolve('src'),join(root,'src'));
  writeFileSync(join(root,'Popover.svelte'),readFileSync('src/views/PetPopover.svelte','utf8'));
  writeFileSync(join(root,'petVisibility.ts'),readFileSync('src/lib/petVisibility.ts','utf8'));
  writeFileSync(join(root,'types.ts'),readFileSync('src/components/pet/types.ts','utf8'));
  writeFileSync(join(root,'Toast.svelte'),'<div data-toasts style="position:fixed;display:none">Test toast boundary</div>');
  writeFileSync(join(root,'toast.js'),`export const toastState = Object.fromEntries(['info','error','success'].map(kind=>[kind,message=>window.feedback.push([kind,message])]));`);
  writeFileSync(join(root,'ipc.js'),`export const isTauri=()=>true;
    export async function invoke(name,args) {
      if(name==='is_pet_overlay_open') return window.nativeVisible;
      window.commands.push([name,args]);
      if(name==='get_agent_sessions') return window.sessionFixtures;
      if(name==='get_pet_care_state') return window.careFixture;
      if(name==='clear_agent_sessions') window.sessionFixtures=[];
      if(name==='dismiss_agent_session') window.sessionFixtures=window.sessionFixtures.filter(s=>s.id!==args.id);
      if(name==='toggle_pet_overlay') {window.requests.push(args.enable); if(window.rejectVisibility) throw new Error('native fixture rejection'); window.nativeVisible=args.enable; return args.enable;}
    }`);
  writeFileSync(join(root,'index.html'),'<html lang="en"><head><title>AgentPet test</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>');
  writeFileSync(join(root,'main.js'),`
    import { mount } from 'svelte'; import Popover from './Popover.svelte'; import './src/styles.css';
    window.feedback=[]; window.requests=[]; window.commands=[]; window.sessionFixtures=[]; window.careFixture=null;
    window.nativeVisible=true; window.rejectVisibility=true;
    mount(Popover,{target:document.querySelector('#app')});
  `);
  const aliases = {
    '@/lib/petVisibility':join(root,'petVisibility.ts'),
    '@/lib/toast.svelte':join(root,'toast.js'),
    '@/components/ui/ToastHost.svelte':join(root,'Toast.svelte'),
    '@/components/pet/types':join(root,'types.ts'),
    '@tauri-apps/api/core':join(root,'ipc.js'),
    '@':resolve('src'),
  };
  server=await createServer({configFile:false,root,plugins:[svelte({configFile:false}),tailwindcss()],resolve:{alias:aliases,dedupe:['svelte']},optimizeDeps:{exclude:['@lucide/svelte']},server:{port:0,host:'127.0.0.1',fs:{allow:[root,process.cwd()]}}});
  await server.listen();
  const port=server.httpServer.address().port;
  await browser('set','viewport','320','520');
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

  const evaluate = async expression => JSON.parse(await browser('eval', expression));
  const theme = async (family,mode,darkFlavor='mocha') => {
    await browser('eval',`localStorage.setItem('rust-sound.ui-theme',JSON.stringify(${JSON.stringify({family,mode,darkFlavor})}));window.dispatchEvent(new StorageEvent('storage',{key:'rust-sound.ui-theme'}));`);
    await browser('wait','--fn',`document.documentElement.dataset.themePalette==='${family==='default' ? `default-${mode}` : mode==='light' ? 'latte' : darkFlavor}'`);
  };
  const layout = () => evaluate(`(() => {
    const surface=document.querySelector('.pet-popover'), content=document.querySelector('main'), footer=document.querySelector('footer');
    const box=surface.getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,right:box.right,bottom:box.bottom,
      pageOverflow:document.documentElement.scrollHeight>innerHeight || document.documentElement.scrollWidth>innerWidth,
      horizontalOverflow:content.scrollWidth>content.clientWidth,
      footerBottom:footer.getBoundingClientRect().bottom,
      background:getComputedStyle(document.body).backgroundColor,
      switches:[...document.querySelectorAll('[role=switch]')].map(el=>({right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,label:el.labels?.[0]?.textContent.trim()})),
      ranges:[...document.querySelectorAll('input[type=range]')].map(el=>({id:el.id,min:el.min,max:el.max,label:el.labels?.[0]?.textContent.trim()}))};
  })()`);
  const checkContrast = () => evaluate(`(() => {
    const luminance = color => {const values=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722};
    return [...document.querySelectorAll('h1,h2,.subtitle,.pet-name,.level,.hunger,.companion-stats span,.empty-agents,.setting-label,output,.session-project,.session-state,.elapsed,.text-action,footer button:not(:disabled)')].map(el=>{
      let ancestor=el, bg; do {bg=getComputedStyle(ancestor).backgroundColor;ancestor=ancestor.parentElement} while(bg==='rgba(0, 0, 0, 0)' && ancestor);
      const a=luminance(getComputedStyle(el).color), b=luminance(bg);
      return {text:el.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  })()`);
  for(const [family,mode] of [['default','light'],['default','dark'],['catppuccin','light'],['catppuccin','dark']]) {
    await theme(family,mode);
    const geometry=await layout();
    assert.deepEqual([geometry.width,geometry.height],[320,520]);
    assert.equal(geometry.pageOverflow,false); assert.equal(geometry.horizontalOverflow,false);
    assert.ok(geometry.right<=320 && geometry.bottom<=520 && geometry.footerBottom<=520);
    assert.equal(geometry.background,'rgba(0, 0, 0, 0)');
    assert.equal(geometry.switches.length,6);
    assert.equal(new Set(geometry.switches.map(s=>s.right)).size,1,'all switches align');
    assert.ok(geometry.switches.every(s=>s.label && s.width===30),'all switches have labels and styled tracks');
    assert.ok(geometry.ranges.every(s=>s.label),'sliders have visible labels');
    assert.deepEqual(geometry.ranges.map(({id,min,max})=>[id,min,max]),[['pet-size','80','300'],['animation-fps','1','12']]);
    const contrasts=await checkContrast();
    for(const entry of contrasts) assert.ok(entry.ratio>=4.5,`${family}/${mode}: ${entry.text} contrast ${entry.ratio}`);
    console.log(`${family}/${mode}: minimum text contrast ${Math.min(...contrasts.map(entry=>entry.ratio)).toFixed(2)}:1; 320x520 without page/horizontal overflow`);
    await browser('screenshot',join(screenshots,`${family}-${mode}.png`));
  }
  assert.equal(await evaluate(`document.querySelector('.empty-agents').textContent`),'Nothing running right now.');
  assert.equal(await evaluate(`document.querySelector('footer button[disabled]').title`),'Update checking is not available');

  // Unimplemented capabilities are truthful and preserve existing saved values.
  for (const [id,key] of [['show-chat','ap_show_chat'],['show-bubble','ap_show_bubble'],['split-pet','ap_split_pet']]) {
    await browser('eval',`localStorage.setItem('${key}','1');window.dispatchEvent(new StorageEvent('storage',{key:'${key}'}));`);
    assert.ok(await evaluate(`document.getElementById('${id}').disabled && document.getElementById('${id}').checked`));
    assert.ok(await evaluate(`document.getElementById(document.getElementById('${id}').getAttribute('aria-describedby')).textContent.includes('not available yet')`));
    await browser('eval',`document.getElementById('${id}').click()`);
    assert.equal(await evaluate(`localStorage.getItem('${key}')`),'1');
  }
  // Working preferences persist; conditional FPS and slider endpoints work.
  for(const [id,key,expected] of [['show-count','ap_show_count','0']]) {
    await browser('eval',`document.getElementById('${id}').click()`);
    assert.equal(await evaluate(`localStorage.getItem('${key}')`),expected);
  }
  await browser('eval',`document.getElementById('animate-pets').click()`);
  assert.equal(await evaluate(`localStorage.getItem('ap_animate_pets')`),'0');
  assert.equal(await evaluate(`!!document.getElementById('animation-fps')`),false);
  assert.ok(await evaluate(`(() => {
    const surface = document.querySelector('.pet-popover');
    const footer = document.querySelector('footer');
    return Math.abs(surface.getBoundingClientRect().bottom - parseFloat(getComputedStyle(surface).borderBottomWidth) - footer.getBoundingClientRect().bottom) < 1;
  })()`),'footer stays pinned with no sessions and animation disabled');
  await browser('eval',`document.getElementById('animate-pets').click();window.sizeEvents=0;window.addEventListener('storage',()=>window.sizeEvents++)`);
  for(const [id,key,values] of [['pet-size','rust_sound_pet_size',[80,300]],['animation-fps','ap_animation_fps',[1,12]]]) {
    for(const value of values) {
      await browser('eval',`(()=>{const el=document.getElementById('${id}');el.value=${value};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await evaluate(`localStorage.getItem('${key}')`),String(value));
    }
  }
  assert.equal(await evaluate('window.sizeEvents'),4,'size and FPS changes notify same-window consumers');
  await browser('eval',`window.sessionFixtures=Array.from({length:9},(_,i)=>({id:String(i),agent_kind:'codex',project:i===1?null:'/workspace/'+(i===0?'long-project-name-that-must-truncate-without-overflow':'project-'+i),state:['working','waiting','done','idle','registered'][i%5],started_at:1700000000,last_event_at:1700000123}));window.careFixture={xp:180,display_level:2,hunger:'Full',tokens_today:12500,meals_today:3};`);
  await browser('wait','--fn',`document.querySelectorAll('.session').length===6`);
  assert.ok((await evaluate(`document.querySelector('.companion-stats').textContent`)).includes('13k tokens · 3 meals'));
  assert.equal(await evaluate(`document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')`),'25');
  assert.equal(await evaluate(`document.querySelectorAll('.session-project')[1].textContent.trim()`),'codex','kind fallback retained');
  assert.equal((await layout()).horizontalOverflow,false);
  // Keyboard-only dismissal is always present and focusable, not hover-gated.
  await browser('focus','.dismiss-session');
  await browser('press','Enter');
  assert.equal(await evaluate(`document.querySelectorAll('.session').length`),5);
  assert.ok(await evaluate(`window.commands.some(([name,args])=>name==='dismiss_agent_session' && args.id==='0')`));
  await theme('default','light');
  await browser('eval',`document.querySelector('main').scrollTop=0`);
  for(const entry of await checkContrast()) assert.ok(entry.ratio>=4.5,`populated session contrast: ${entry.text} ${entry.ratio}`);
  await browser('screenshot',join(screenshots,'populated-light.png'));
  await theme('default','dark');
  await browser('eval',`document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight`);
  assert.ok(await evaluate(`(()=>{const main=document.querySelector('main'),fps=document.getElementById('animation-fps').getBoundingClientRect();return main.scrollTop>0 && fps.bottom<=document.querySelector('footer').getBoundingClientRect().top})()`),'populated content scrolls to the final control above the pinned footer');
  await browser('screenshot',join(screenshots,'scrolled-dark.png'));
  await browser('focus','#animate-pets');
  await browser('press','Space');
  assert.equal(await evaluate(`localStorage.getItem('ap_animate_pets')`),'0','keyboard switch activation persists');
  assert.ok(await evaluate(`getComputedStyle(document.activeElement).outlineWidth!=='0px'`),'visible keyboard focus');
  await browser('eval',`document.querySelector('.text-action').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.session').length`),0);
  assert.ok(await evaluate(`window.commands.some(([name])=>name==='clear_agent_sessions')`));
  await browser('eval',`document.querySelector('footer button').click();document.querySelector('.quit-action').click()`);
  assert.ok(await evaluate(`['show_main_window','close_pet_popover','quit_app'].every(expected=>window.commands.some(([name])=>name===expected))`));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('rust_sound_navigation_request')).tab`),'pet-settings');
  console.log('PASS production styles: default light/dark + Latte/Mocha contrast >=4.5; 320x520 geometry; aligned labeled switches; persistence; slider endpoints; populated sessions; keyboard dismiss/focus; footer IPC');
  console.log('Screenshots:',screenshots);
} finally {
  await browser('close').catch(()=>{});
  await server?.close(); rmSync(root,{recursive:true,force:true});
}
