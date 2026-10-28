// Real gallery, IndexedDB and renderer via agent-browser; only CDN responses are fixtures.
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { buildPetCatalog } from '../scripts/upload-pets-cloudinary.mjs';
const exec = promisify(execFile), root = realpathSync(mkdtempSync(join(tmpdir(),'pet-cloud-')));
const session = `pet-cloud-${process.pid}`;
const live = process.argv.includes('--live');
const browser = async (...args) => (await exec('agent-browser',['--session',session,...args],{timeout:30000})).stdout;
const evaluate = async code => JSON.parse(await browser('eval',code));
let server;
try {
  symlinkSync(resolve('node_modules'),join(root,'node_modules'));
  symlinkSync(resolve('public'),join(root,'public'));
  symlinkSync(resolve('src'),join(root,'src'));
  const catalog = buildPetCatalog();
  catalog.pets = catalog.pets.slice(0, 2);
  for (const pet of catalog.pets) for (const asset of pet.assets) asset.url = `https://res.cloudinary.com/mvvfpbof/image/upload/v1${asset.path}`;
  writeFileSync(join(root,'catalog.json'),JSON.stringify(catalog));
  writeFileSync(join(root,'toast.js'),`export const toastState=Object.fromEntries(['info','error','success'].map(kind=>[kind,message=>window.feedback.push([kind,message])]));`);
  writeFileSync(join(root,'Fixture.svelte'),`<script>import Gallery from '@/components/pet/PetGallery.svelte';import Sprite from '@/components/AgentPetSprite.svelte';</script><main><Gallery selectedPet="code-frenzy-cat"/><Sprite slug="code-frenzy-cat" mood="idle" level={35}/></main>`);
  writeFileSync(join(root,'index.html'),'<html><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>');
  writeFileSync(join(root,'main.js'),`
    import { mount } from 'svelte';import Fixture from './Fixture.svelte';import '@/styles.css';
    import {restoreInstalledPets,subscribePetInstallations,installCloudPet,fetchPetCatalog} from '@/lib/petCloud';
    import {resolvePetSpritesheetUrls} from '@/shared/lib/petRenderer';
    window.feedback=[];window.installCloudPet=installCloudPet;window.fetchPetCatalog=fetchPetCatalog;window.resolveSheet=resolvePetSpritesheetUrls;
    const nativeFetch=window.fetch.bind(window);window.failAsset=false;window.offline=new URLSearchParams(location.search).has('offline');
    window.imageLoads=[];const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
    Object.defineProperty(HTMLImageElement.prototype,'src',{...imageSrc,set(value){window.imageLoads.push(value);imageSrc.set.call(this,value)}});
    const live=${live};
    window.fetch=async (url,options)=>{
      if(String(url).startsWith('https://res.cloudinary.com/')){
        if(window.offline)throw new Error('network offline fixture');
        if(String(url).includes('/raw/upload/'))return live ? nativeFetch(url,options) : nativeFetch('/catalog.json');
        if(window.failAsset)return new Response('failed',{status:404});
        return nativeFetch(live ? url : String(url).slice(String(url).indexOf('/pets/')),options);
      }
      return nativeFetch(url,options);
    };
    await restoreInstalledPets();subscribePetInstallations();
    mount(Fixture,{target:document.querySelector('#app')});window.ready=true;
  `);
  server=await createServer({configFile:false,root,plugins:[svelte({configFile:false}),tailwindcss()],resolve:{alias:{'@/lib/toast.svelte':join(root,'toast.js'),'@':resolve('src')},dedupe:['svelte']},optimizeDeps:{exclude:['@lucide/svelte']},server:{port:0,host:'127.0.0.1',fs:{allow:[root,process.cwd()]}}});
  await server.listen();const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  await browser('open',url);await browser('wait','--fn','window.ready');
  await browser('wait','button[aria-label="Tải Code Frenzy Cat về máy"]');
  await browser('snapshot','-i');
  await browser('focus','button[aria-label="Tải Code Frenzy Cat về máy"]');
  await browser('press','Enter');
  await browser('snapshot','-i');
  await browser('wait','--text','Đã tải offline');
  assert.ok(await evaluate(`document.activeElement?.getAttribute('aria-label')==='Tải Code Frenzy Cat về máy'`),'install completion preserves keyboard focus');
  assert.equal(await evaluate(`window.feedback.at(-1)[0]`),'success');
  assert.equal(await evaluate(`Object.keys(window.__PET_ASSET_URLS__).length`),21);
  assert.ok(await evaluate(`window.resolveSheet('/pets/code-frenzy-cat/forms/singularity/spritesheet.webp').cdnUrl.startsWith('blob:')`));
  assert.equal(await evaluate(`localStorage.getItem('rust_sound_pet_slug')`),null,'installation must not auto-equip');
  await browser('eval',`window.failAsset=true;document.querySelector('button[aria-label="Tải Boba Otter về máy"]').click()`);
  await browser('wait','--text','Không thể lưu pet');
  assert.equal(await evaluate(`Object.keys(window.__PET_ASSET_URLS__).length`),21,'failed install leaves previous complete pet');
  await browser('eval',`window.failAsset=false;window.offline=true;[...document.querySelectorAll('button')].find(b=>b.textContent==='Làm mới').click()`);
  await browser('wait','--text','Không tải được danh mục');
  await browser('open',`${url}/?offline=1`);await browser('wait','--fn','window.ready');
  await browser('wait','--text','Không tải được danh mục');
  await browser('wait','--fn',`window.imageLoads.some(url=>url.startsWith('blob:'))`);
  assert.equal(await evaluate(`Object.keys(window.__PET_ASSET_URLS__).length`),21,'restart restores persistent blobs before mount');
  await browser('eval',`window.offline=true`);
  assert.ok(await evaluate(`window.resolveSheet('code-frenzy-cat').cdnUrl.startsWith('blob:')`));
  const rollback = await evaluate(`(async()=>{const before=Object.keys(window.__PET_ASSET_URLS__).length;const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Quota','QuotaExceededError')};try{window.offline=false;await window.installCloudPet(${JSON.stringify(catalog.pets[1])});return false}catch{return Object.keys(window.__PET_ASSET_URLS__).length===before}finally{IDBObjectStore.prototype.put=original}})()`);
  assert.equal(rollback,true,'quota failure never activates partial download');
  await browser('tab','new',`${url}/?offline=1`);
  await browser('wait','--fn','window.ready');
  assert.equal(await evaluate(`Object.keys(window.__PET_ASSET_URLS__).length`),21,'new overlay-equivalent webview restores installation offline');
  await browser('tab','t1');
  await browser('eval',`window.offline=false;[...document.querySelectorAll('button')].find(b=>b.textContent==='Làm mới').click()`);
  await browser('wait','button[aria-label="Tải Boba Otter về máy"]');
  await browser('click','button[aria-label="Tải Boba Otter về máy"]');
  await browser('snapshot','-i');
  await browser('wait','--fn',`Object.keys(window.__PET_ASSET_URLS__).length===42`);
  await browser('tab','t2');
  await browser('wait','--fn',`Object.keys(window.__PET_ASSET_URLS__).length===42`);
  await browser('tab','t1');
  await browser('set','viewport','375','812');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'375px gallery does not overflow');
  await browser('screenshot','/tmp/pet-cloud-375.png');
  await browser('set','viewport','1100','850');
  await browser('screenshot','/tmp/pet-cloud-desktop.png');
  if (!live) {
    await browser('eval',`window.fetch=async()=>new Response(JSON.stringify({schema:1,pets:[]}),{headers:{'content-type':'application/json'}});[...document.querySelectorAll('button')].find(b=>b.textContent==='Làm mới').click()`);
    await browser('wait','--text','Chưa có pet được xuất bản');
  }
  console.log('PASS gallery install, persistent restart, offline resolver, no auto-equip, failed download/quota rollback, catalog retry, 375px layout');
  if (process.argv.includes('--native')) {
    const native = await exec('swift', ['tests/pet-cloud-native.swift', url], { timeout: 180_000 });
    console.log(native.stdout.trim());
  }
} finally { await browser('close').catch(()=>{});await server?.close();rmSync(root,{recursive:true,force:true}); }
