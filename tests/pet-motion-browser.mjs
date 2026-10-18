// Real bundled assets through the production renderer: all pets, rows, sizes and playback policies.
import { mkdtempSync, symlinkSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile), root = realpathSync(mkdtempSync(join(tmpdir(), 'pet-motion-')));
const session = `pet-motion-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { timeout: 30000 })).stdout;
const evaluate = async code => JSON.parse(await browser('eval', code));
let server;
try {
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  symlinkSync(resolve('src'), join(root, 'src'));
  symlinkSync(resolve('public'), join(root, 'public'));
  writeFileSync(join(root, 'index.html'), `<html lang="en"><meta charset="utf-8"><title>Pet motion QA</title><style>
    body{margin:20px;background:#151b23;color:#f1f5f9;font:13px system-ui}h1{font-size:20px}section{display:grid;grid-template-columns:160px repeat(7,120px);align-items:center;border-bottom:1px solid #334155}canvas{width:110px;height:110px}label{font-weight:600}header{display:grid;grid-template-columns:160px repeat(7,120px);font-size:11px}p{color:#94a3b8}
    </style><h1>Pet motion — original art, stable anchors</h1><p>Idle · wave · celebration · settled sleep · waiting · working · reading</p><header id="names"><span>State</span></header><main></main><script type="module" src="/main.js"></script></html>`);
  writeFileSync(join(root, 'main.js'), `import {PetRenderer, slice, PET_MOTION, petFrameIndex} from '@/shared/lib/petRenderer';
    window.renderers=[];window.draws=new WeakMap();window.profiles=PET_MOTION;window.petFrameIndex=petFrameIndex;
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.isConnected)window.draws.set(this.canvas,args.slice(1));return draw.apply(this,args)};
    const pets=Object.keys(PET_MOTION), states=['idle','done','celebrate','sleepy','waiting','working','reading'];
    pets.forEach(slug=>{const label=document.createElement('span');label.textContent=slug;document.querySelector('#names').append(label)});
    for(const state of states){const section=document.createElement('section');section.innerHTML='<label>'+state+'</label>';document.querySelector('main').append(section);
      for(const slug of pets){const canvas=document.createElement('canvas');canvas.width=360;canvas.height=360;canvas.style.imageRendering=PET_MOTION[slug].pixel?'pixelated':'auto';section.append(canvas);
        const renderer=new PetRenderer(canvas,slug);renderer.setState(state);renderer.load('/pets/'+slug+'/spritesheet.webp');window.renderers.push({renderer,canvas,slug,state});}}
    window.dispose=()=>window.renderers.forEach(({renderer})=>renderer.destroy());
  `);
  server = await createServer({ configFile: false, root, resolve: { alias: { '@': resolve('src') } }, server: { port: 0, host: '127.0.0.1', fs: { allow: [root, process.cwd()] } } });
  await server.listen();
  await browser('open', `http://127.0.0.1:${server.httpServer.address().port}`);
  await browser('wait', '--fn', 'window.renderers?.length===49 && window.renderers.every(({renderer})=>renderer.loaded)');
  const counts = await evaluate(`window.renderers.slice(0,7).map(({renderer,slug})=>({slug,counts:renderer.clips.map(c=>c.length)}))`);
  for (const { slug, counts: rows } of counts) assert.deepEqual(rows, [6,8,8,4,5,8,6,6,6], `${slug}: no missing/phantom frames`);
  console.log('PASS all seven real sheets retain exactly nine rows and correct frame counts');
  const geometry = await evaluate(`(() => {
    const errors=[];
    for(const {renderer:r,canvas,slug} of window.renderers.filter(x=>x.state==='idle')){
      for(const size of [80,180,300]){
        canvas.width=size*2;canvas.height=size*2;let reference;
        for(let row=0;row<9;row++)for(let frame=0;frame<r.clips[row].length;frame++){
          r.row=row;r.frame=frame;r.draw();const draw=window.draws.get(canvas),dest=JSON.stringify(draw.slice(4));reference??=dest;
          if(dest!==reference)errors.push(slug+' scale/anchor changed');
          const [x,y,w,h,dx,dy,dw,dh]=draw;
          if(x<0||y<0||x+w>r.img.naturalWidth||y+h>r.img.naturalHeight||dx<0||dy<0||dx+dw>canvas.width||dy+dh>canvas.height)errors.push(slug+' bounds');
          if(canvas.getContext('2d').imageSmoothingEnabled===window.profiles[slug].pixel)errors.push(slug+' sampling');
        }
        canvas.width=360;canvas.height=360;
      }
      r.setState('idle');
    }
    return errors;
  })()`);
  assert.deepEqual(geometry, []);
  console.log('PASS every frame/state stays anchored and in bounds at 80/180/300px with correct sampling');
  await browser('eval', `window.renderers.forEach(({renderer:r,state})=>{r.frame=state==='sleepy'?100:2;r.draw()})`);
  const screenshot = process.env.PET_MOTION_SCREENSHOT;
  if (screenshot) { await browser('set', 'viewport', '1080', '980'); await browser('screenshot', screenshot, '--full'); }
  await browser('eval', `window.renderers.forEach(({renderer:r})=>r.setState('working'))`);
  await browser('set', 'media', 'dark', 'reduced-motion');
  await browser('wait', '--fn', 'window.renderers.every(({renderer:r})=>!r.animate && r.animId===null)');
  console.log('PASS system reduced motion freezes every production canvas');
  await browser('set', 'media', 'dark');
  await browser('wait', '--fn', 'window.renderers.some(({renderer:r})=>r.animate && r.animId!==null)');
  console.log('PASS visible pets resume after live reduced-motion change');
  await browser('eval', 'window.dispose()');
  assert.equal(await evaluate('window.renderers.every(({renderer:r})=>r.animId===null)'), true);
  console.log('PASS all renderer animation requests cancel on disposal');
} finally {
  await browser('close').catch(() => {}); await server?.close(); rmSync(root, { recursive: true, force: true });
}
