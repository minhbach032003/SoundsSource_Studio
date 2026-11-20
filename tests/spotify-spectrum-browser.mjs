// Execute the actual compiled inspector; stub only native IPC and unrelated test audio.
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
const root = realpathSync(mkdtempSync(join(tmpdir(), 'spotify-spectrum-')));
const session = `spotify-spectrum-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { timeout: 30000 })).stdout;
let server;
try {
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  writeFileSync(join(root, 'Inspector.svelte'), readFileSync('src/components/audio/StudioEQInspector.svelte', 'utf8'));
  writeFileSync(join(root, 'meters.js'), 'export const liveAudioMetersState={spectrumHeights:Array(28).fill(4)};');
  writeFileSync(join(root, 'audio.js'), 'export const audioDspChain={setEQBands(){}};');
  writeFileSync(join(root, 'Modal.svelte'), readFileSync('src/components/ui/Modal.svelte', 'utf8'));
  writeFileSync(join(root, 'toast.js'), 'export const toastState={error(){},info(){}};');
  writeFileSync(join(root, 'ipc.js'), `export const isTauri=()=>true;
    export async function invoke(name, args) {
      if(name==='get_master_eq_bands') return {bands:Array.from({length:10},()=>({gain:0}))};
      if(name==='get_master_spectrum') { window.calls++; if(window.rejectSpectrum) throw new Error('Capture unavailable'); return structuredClone(window.spectrum); }
      if(name==='set_system_audio_enabled') {
        window.routeCalls.push(args.enabled);
        if(window.routePending) await new Promise(resolve=>window.resolveRoute=resolve);
        if(window.rejectRoute) throw new Error('System Audio Recording permission denied');
        window.spectrum={...window.spectrum,source:args.enabled?'system':'spotify',system_audio_enabled:args.enabled,enabled:args.enabled,connected:args.enabled,error:null};
        return {system_wide:args.enabled,running:args.enabled};
      }
    }`);
  writeFileSync(join(root, 'style.css'), readFileSync('src/styles.css', 'utf8'));
  symlinkSync(resolve('src/fonts'), join(root, 'fonts'));
  writeFileSync(join(root, 'index.html'), '<div id="app" style="max-width:720px;margin:24px auto"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(root, 'main.js'), `import './style.css'; import {mount,unmount} from 'svelte'; import Inspector from './Inspector.svelte';
    window.calls=0; window.routeCalls=[]; window.spectrum={source:'spotify',system_audio_enabled:false,heights:Array(28).fill(0),receiving:true,has_signal:true,enabled:true,connected:true,error:null};
    window.spectrum.heights[15]=80;
    const component=mount(Inspector,{target:document.querySelector('#app')}); window.dispose=()=>unmount(component);
    window.section=()=>Array.from(document.querySelectorAll('span')).find(e=>e.textContent.trim()==='Live 28-Band Spectrum Analyzer').parentElement.parentElement;
    window.heights=()=>Array.from(window.section().querySelectorAll('div[style^="height:"]')).map(e=>parseFloat(e.style.height));`);
  server = await createServer({configFile:false,root,plugins:[svelte({configFile:false}),tailwindcss()],resolve:{alias:{
    '@/lib/liveAudioMeters.svelte':join(root,'meters.js'), '@/shared/lib/audioDspChain':join(root,'audio.js'),
    '@/lib/toast.svelte':join(root,'toast.js'), '@/components/ui/Modal.svelte':join(root,'Modal.svelte'), '@tauri-apps/api/core':join(root,'ipc.js'),
  },dedupe:['svelte']},optimizeDeps:{exclude:['@lucide/svelte']},server:{port:0,host:'127.0.0.1',fs:{allow:[root,resolve('src/fonts')]}}});
  await server.listen();
  await browser('open', `http://127.0.0.1:${server.httpServer.address().port}`);
  await browser('wait', '--text', 'Live 28-Band Spectrum Analyzer');
  const heights = JSON.parse(await browser('eval', 'window.heights()'));
  assert.equal(heights.length, 28);
  assert.equal(heights[15], 80, 'native Spotify signal must drive the actual rendered bar');
  await browser('wait','--text','SPOTIFY LIVE');
  await browser('eval', 'window.spectrum.has_signal=false; window.spectrum.heights.fill(0)');
  await browser('wait','--text','SILENT');
  assert.ok(JSON.parse(await browser('eval','window.heights()')).every(h=>h===0));
  await browser('eval','window.spectrum.receiving=false');
  await browser('wait','--text','NO SIGNAL');
  await browser('eval','window.spectrum.enabled=false; window.spectrum.connected=false');
  await browser('wait','--text','DSP DISCONNECTED');
  await browser('eval','window.spectrum.heights=[NaN]');
  await browser('wait','--text','Invalid audio spectrum data');
  await browser('eval','window.spectrum.heights=Array(28).fill(0); window.spectrum.error="System Audio Recording permission denied"');
  await browser('wait','--text','System Audio Recording permission denied');
  await browser('eval','window.rejectSpectrum=true');
  await browser('wait','--text','Capture unavailable');
  await browser('eval','window.rejectSpectrum=false; window.spectrum.error=null; window.spectrum.enabled=true; window.spectrum.connected=true; window.spectrum.receiving=true; window.spectrum.has_signal=true; window.spectrum.heights[8]=65');
  await browser('wait','--text','SPOTIFY LIVE');
  assert.equal(JSON.parse(await browser('eval','window.heights()'))[8],65);

  await browser('eval', 'window.spectrum.source="system"; window.spectrum.system_audio_enabled=true');
  await browser('wait', '--text', 'SYSTEM AUDIO LIVE');
  await browser('eval', 'window.spectrum.source="application"; window.spectrum.system_audio_enabled=false');
  await browser('wait', '--text', 'APPLICATION LIVE');
  await browser('eval', 'window.spectrum.source="spotify"');
  await browser('wait', '--text', 'SPOTIFY LIVE');

  await browser('find', 'text', 'Bass Boost', 'click');
  await browser('snapshot', '-i');
  assert.equal(JSON.parse(await browser('eval', '!!document.querySelector("[role=dialog]")')), false, 'selecting Bass must preserve the playback route');
  await browser('focus', '[role=slider][aria-label="64 Hz"]');
  await browser('press', 'ArrowUp');
  await browser('snapshot', '-i');
  assert.equal(JSON.parse(await browser('eval', '!!document.querySelector("[role=dialog]")')), false, 'editing EQ must preserve the playback route');
  assert.deepEqual(JSON.parse(await browser('eval', 'window.routeCalls')), [], 'EQ edits must not start capture');
  await browser('find', 'role', 'button', 'click', '--name', 'Enable System audio', '--exact');
  await browser('snapshot', '-i');
  await browser('wait', '--text', 'Enable System audio EQ?');
  await browser('wait', '--fn', 'document.querySelector("[role=dialog]").contains(document.activeElement)');
  await browser('press', 'Escape');
  await browser('snapshot', '-i');
  assert.deepEqual(JSON.parse(await browser('eval', 'window.routeCalls')), [], 'cancel must not activate capture');

  await browser('find', 'text', 'Bass Boost', 'click');
  await browser('snapshot', '-i');
  assert.equal(JSON.parse(await browser('eval', '!!document.querySelector("[role=dialog]")')), false, 'a cancelled prompt must not reopen on every EQ edit');
  await browser('find', 'role', 'button', 'click', '--name', 'Enable System audio', '--exact');
  await browser('snapshot', '-i');
  await browser('wait', '--text', 'Enable System audio EQ?');
  await browser('eval', 'window.routePending=true');
  await browser('find', 'role', 'button', 'click', '--name', 'Enable System audio', '--exact');
  await browser('snapshot', '-i');
  await browser('press', 'Escape');
  await browser('snapshot', '-i');
  assert.equal(JSON.parse(await browser('eval', '!!document.querySelector("[role=dialog]")')), true, 'pending routing must not dismiss');
  assert.equal(JSON.parse(await browser('eval', 'window.routeCalls.length')), 1);
  await browser('eval', 'window.routePending=false; window.resolveRoute()');
  await browser('wait', '--text', 'SYSTEM AUDIO LIVE');
  await browser('wait', '--fn', '!document.querySelector("[role=dialog]")');
  assert.equal(JSON.parse(await browser('eval', 'document.querySelector("button[aria-pressed]").getAttribute("aria-pressed")')), 'true');
  await browser('find', 'text', 'Bass Boost', 'click');
  await browser('snapshot', '-i');
  await browser('focus', '[role=slider][aria-label="64 Hz"]');
  await browser('press', 'ArrowDown');
  await browser('snapshot', '-i');
  assert.deepEqual(JSON.parse(await browser('eval', 'window.routeCalls')), [true], 'active System audio must not restart on Bass/fader edits');
  assert.equal(JSON.parse(await browser('eval', '!!document.querySelector("[role=dialog]")')), false);

  await browser('find', 'role', 'button', 'click', '--name', 'System audio on', '--exact');
  await browser('snapshot', '-i');
  await browser('eval', 'window.rejectRoute=true');
  await browser('find', 'role', 'button', 'click', '--name', 'Restore direct playback', '--exact');
  await browser('snapshot', '-i');
  await browser('wait', '--text', 'System Audio Recording permission denied');
  assert.equal(JSON.parse(await browser('eval', '!!document.querySelector("[role=dialog] [role=alert]")')), true);
  await browser('eval', 'window.rejectRoute=false');
  await browser('find', 'role', 'button', 'click', '--name', 'Restore direct playback', '--exact');
  await browser('snapshot', '-i');
  await browser('wait', '--text', 'DSP DISCONNECTED');
  assert.deepEqual(JSON.parse(await browser('eval', 'window.routeCalls')), [true, false, false]);

  await browser('set', 'viewport', '375', '900');
  await browser('find', 'role', 'button', 'click', '--name', 'Enable System audio', '--exact');
  await browser('snapshot', '-i');
  await browser('wait', '--text', 'Enable System audio EQ?');
  assert.equal(JSON.parse(await browser('eval', 'document.documentElement.scrollWidth <= innerWidth')), true, '375px routing must not overflow');
  await browser('screenshot', '/tmp/system-audio-routing-375.png');
  await browser('press', 'Tab');
  await browser('snapshot', '-i');
  assert.equal(JSON.parse(await browser('eval', 'document.querySelector("[role=dialog]").contains(document.activeElement)')), true);
  await browser('press', 'Escape');
  await browser('snapshot', '-i');
  await browser('eval', 'document.documentElement.dataset.themeMode="dark"');
  await browser('set', 'viewport', '1000', '1000');
  await browser('screenshot', '/tmp/system-audio-spectrum-dark.png');

  await browser('eval','Object.defineProperty(document,"hidden",{value:true,configurable:true})');
  const hiddenCalls = JSON.parse(await browser('eval','window.calls'));
  await new Promise(r=>setTimeout(r,200));
  assert.equal(JSON.parse(await browser('eval','window.calls')),hiddenCalls,'hidden inspector must not request analysis');
  await browser('eval','Object.defineProperty(document,"hidden",{value:false,configurable:true})');
  await browser('wait','--fn',`window.calls > ${hiddenCalls}`);
  await browser('eval','window.section().scrollIntoView({block:"center"})');
  await browser('screenshot','/tmp/spotify-spectrum-browser.png');
  await browser('eval','window.dispose()');
  const calls = JSON.parse(await browser('eval','window.calls'));
  await new Promise(r=>setTimeout(r,200));
  assert.equal(JSON.parse(await browser('eval','window.calls')),calls,'unmount must stop spectrum polling');
  console.log('PASS mounted master spectrum: Spotify/application/system PCM, confirmation/cancel/pending/error/retry, keyboard/375px/dark, silence/stale/IPC recovery and cleanup');
} finally {
  await browser('close').catch(()=>{});
  await server?.close();
  rmSync(root,{recursive:true,force:true});
}
