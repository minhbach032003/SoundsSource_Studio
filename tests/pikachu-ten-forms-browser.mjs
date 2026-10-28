// Real-canvas integration at shipped stage sizes; run with agent-browser installed.
import { mkdtempSync, symlinkSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const root = realpathSync(mkdtempSync(join(tmpdir(), "pikachu-ten-forms-")));
const session = `pikachu-browser-${process.pid}`;
const browser = async (...args) => (await exec("timeout", ["40", "agent-browser", "--session", session, ...args], { timeout: 45000 })).stdout;
const evaluate = async (code) => JSON.parse(await browser("eval", code));
let server;
try {
  for (const name of ["node_modules", "src", "public"]) symlinkSync(resolve(name), join(root, name));
  writeFileSync(join(root, "lucide.js"), "export const Utensils={}, Trophy={}, Crown={}, Zap={}, Flame={}, Sparkles={}, PawPrint={}, Compass={}, Shield={}, Medal={}, Calendar={}, Award={}, Moon={};");
  writeFileSync(join(root, "index.html"), `<html lang="en"><meta charset="utf-8"><title>Pikachu stage QA</title>
<style>
body { margin:20px; background:#0f172a; color:#f8fafc; font:12px system-ui; }
h1 { color:#fde047; } .grid { display:grid; grid-template-columns:repeat(5, 320px); gap:16px; }
.card { padding:10px; border:1px solid #64748b; border-radius:8px; } .stages { display:flex; align-items:end; gap:8px; }
canvas { background:#0b0f19; } .light { background:#f5f0e8; color:#493123; } h2 { font-size:14px; }
</style><h1>Ten reference forms — 200px / 96px, dark / light</h1>
<p>Authored chibi art; yellow / white electricity; Goku flame control below.</p><div class="grid" id="container"></div>
<script>window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));</script>
<script type="module" src="/main.js"></script></html>`);
  writeFileSync(join(root, "main.js"), `
import { PetRenderer, petFormAura, drawPetFrame, slice } from '@/shared/lib/petRenderer';
import { writePetPreference } from '@/lib/petPreferences';
import { INSTALLED_PETS, resolvePetActiveForm } from '@/components/pet/types';
import anchors from '${resolve("public/pets/pikachu/forms/anchors.json")}';
window.renderers=[];
Object.assign(window, { drawPetFrame, slice, anchors, petFormAura, writePetPreference, resolvePetActiveForm });
const pikachu=INSTALLED_PETS.find(p=>p.id==='pikachu');
window.pikachu=pikachu;
for (const form of [...pikachu.forms, INSTALLED_PETS.find(p=>p.id==='super-saiyan-goku').forms.find(f=>f.id==='ss2')]) {
  const slug= form.id==='ss2' ? 'super-saiyan-goku' : 'pikachu';
  for (const light of [false,true]) {
    const card=document.createElement('section'); card.className='card'+(light?' light':'');
    card.innerHTML='<h2>'+form.name+(light?' / light':' / dark')+'</h2><div class="stages"></div>';
    document.querySelector('#container').appendChild(card);
    for (const size of [200,96]) {
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=size;
      canvas.style.width=canvas.style.height=size+'px'; canvas.style.background=light?'#f5f0e8':'#0b0f19';
      card.querySelector('.stages').appendChild(canvas);
      const renderer=new PetRenderer(canvas,slug);
      renderer.setAura(petFormAura(slug,form.id)); renderer.setState('celebrate'); renderer.load(form.spritesheetPath);
      window.renderers.push({id:form.id,slug,renderer,canvas,form});
    }
  }
}
// Chrome 156 on this host adds +/-1 canvas-readback noise even without a
// draw. Keep raw pixels in-page, compare channels with that measured floor,
// and independently assert that no production draw/RAF runs while frozen.
window.capturePixels=()=>renderers.map(({canvas})=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
window.comparePixels=(before)=>capturePixels().map((pixels,n)=>{
  let max=0; for(let i=0;i<pixels.length;i++) max=Math.max(max,Math.abs(pixels[i]-before[n][i]));
  return max;
});
window.drawCount=0;
renderers.forEach(({renderer})=>{const draw=renderer.draw.bind(renderer);renderer.draw=()=>{drawCount++;draw()}});
window.dispose=()=>renderers.forEach(({renderer})=>renderer.destroy());
`);
  server = await createServer({ configFile: false, root,
    resolve: { alias: { "@": resolve("src"), "@lucide/svelte": join(root, "lucide.js") } },
    server: { port: 0, host: "127.0.0.1", fs: { allow: [root, process.cwd()] } } });
  await server.listen();
  await browser("open", `http://127.0.0.1:${server.httpServer.address().port}`);
  await browser("wait", "--fn", "window.renderers?.length === 44 && renderers.every(({renderer})=>renderer.loaded)");
  assert.equal(await evaluate("renderers.filter(r=>r.slug==='pikachu').length"), 40);
  assert.deepEqual(await evaluate(`["original-cap","ash-cap","white-belly","long-tail","gmax","mega-x","mega-y","horned-raichu"].map(id=>resolvePetActiveForm(pikachu,99,id).id)`),
    ["classic", "classic", "concept-white-belly", "concept-long-tail", "gigantamax", "mega-raichu-x", "mega-raichu-y", "gorochu"]);

  await evaluate("window.active=capturePixels();window.activeDraws=drawCount");
  await browser("wait", "450");
  assert.ok(await evaluate("comparePixels(active).some(max=>max>1) && drawCount>activeDraws"), "positive control: enabled animation changes pixels and draws");

  // Freeze through the same preference event used by the app, not by cancelling RAF in the fixture.
  await evaluate("writePetPreference('animate',false)");
  await evaluate("window.off=capturePixels();window.offDraws=drawCount");
  const readbackFloor = await evaluate("Math.max(...comparePixels(off))");
  assert.ok(readbackFloor <= 1, `unexpected immediate readback drift: ${readbackFloor}`);
  console.log(`Canvas immediate repeated-read max channel delta: ${readbackFloor}`);
  await browser("wait", "450");
  assert.ok(await evaluate("comparePixels(off).every(max=>max<=1) && drawCount===offDraws"), "off freezes pixels within measured Chrome readback noise; zero draws");
  assert.ok(await evaluate("renderers.every(({renderer})=>renderer.animId===null)"), "off cancels renderer RAFs");

  // Inspect all 720 authored frames at both sizes through real sliced production rectangles.
  const audit = await evaluate(`(() => {
    const failures=[]; let checked=0;
    for(const item of renderers.filter(r=>r.slug==='pikachu').slice().filter((_,i)=>i%4<2)) {
      const {renderer,canvas,id}=item;
      const ctx=canvas.getContext('2d'); const originalStroke=ctx.stroke.bind(ctx);
      const originalMove=ctx.moveTo.bind(ctx); let strokes=0, starts=[];
      ctx.stroke=(...args)=>{strokes++;return originalStroke(...args)};
      ctx.moveTo=(...args)=>{starts.push(args);return originalMove(...args)};
      try {
        for(let row=0;row<9;row++) for(let frame=0;frame<8;frame++) {
          const r=renderer.clips[row][frame]; strokes=0; starts=[];
          const box=drawPetFrame(ctx,renderer.img,r,'pikachu',canvas,undefined,'',petFormAura('pikachu',id),1);
          if(row===5 && strokes!==0) failures.push(id+'/picker sleep '+strokes);
          if(row!==5) {
            const fw=renderer.img.naturalWidth/8, fh=renderer.img.naturalHeight/9;
            for(const [px,py] of anchors[id][row*8+frame]) {
              const x=box.x+(px-r.x%fw)/r.w*box.w, y=box.y+(py-r.y%fh)/r.h*box.h;
              if(!starts.some(([sx,sy])=>Math.hypot(x-sx,y-sy)<.01)) failures.push(id+'/anchor '+row+'/'+frame);
            }
          }
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data, n=canvas.width;
          for(let k=0;k<n;k++) if(pixels[k*4+3] || pixels[((n-1)*n+k)*4+3] || pixels[k*n*4+3] || pixels[(k*n+n-1)*4+3]) {
            failures.push(id+'/clipped '+row+'/'+frame+'@'+n); break;
          }
          checked++;
        }
        strokes=0; drawPetFrame(ctx,renderer.img,renderer.clips[0][0],'pikachu',canvas,undefined,'sleepy',petFormAura('pikachu',id),1);
        if(strokes) failures.push(id+'/sleepy state');
      } finally {ctx.stroke=originalStroke;ctx.moveTo=originalMove;}
    }
    renderers.forEach(({renderer})=>renderer.draw());
    return {checked,failures};
  })()`);
  assert.equal(audit.checked, 1440);
  assert.deepEqual(audit.failures, []);
  console.log("PASS real sliced-canvas audit:", audit.checked, "frames: landmarks, both facings, sleep, unclipped edges");

  // The media query must stop motion even with the preference enabled.
  await browser("set", "media", "dark", "reduced-motion");
  await evaluate("writePetPreference('animate',true)");
  assert.ok(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"));
  await browser("wait", "100");
  await evaluate("window.reduced=capturePixels();window.reducedDraws=drawCount");
  await browser("wait", "450");
  assert.ok(await evaluate("comparePixels(reduced).every(max=>max<=1) && drawCount===reducedDraws"), "reduced motion freezes pixels within measured readback noise; zero draws");
  assert.ok(await evaluate("renderers.every(({renderer})=>renderer.animId===null)"));

  await browser("set", "viewport", "1720", "1000");
  await browser("screenshot", "/tmp/pikachu-ten-forms-browser-preview.png", "--full");
  await evaluate("renderers.forEach(({renderer})=>renderer.setState('sleepy'))");
  await browser("screenshot", "/tmp/pikachu-ten-forms-sleep-preview.png", "--full");
  assert.deepEqual(await evaluate("window.errors"), [], "registered error and rejection collectors stay empty");
  const browserErrors = await browser("errors");
  assert.ok(!browserErrors.trim() || /no errors/i.test(browserErrors), browserErrors);
  await evaluate("dispose()");
  assert.ok(await evaluate("renderers.every(({renderer})=>renderer.animId===null && renderer.isDestroyed)"));
  console.log("PASS 10 forms at 96/200px, dark/light, off/reduced-motion pixel freeze, no orphan RAF, aliases, no browser errors; Goku SS2 flame control included");
} finally {
  try { await browser("close"); } finally {
    if (server) await server.close();
    rmSync(root, { recursive: true, force: true });
  }
}
