import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('actual desktop mood expression drives real renderer rows for agent activity', () => {
  const overlay=readFileSync('src/views/PetOverlay.svelte','utf8');
  const start=overlay.indexOf('  const mood = $derived<');
  const expression=overlay.slice(start,overlay.indexOf('\n  const projectName',start)).replace('const mood =','globalThis.mood =');
  const rendererSource=readFileSync('src/shared/lib/petRenderer.ts','utf8').replaceAll('export ','');
  const context=vm.createContext({Image:class {},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},
    localStorage:{getItem:()=>null},$derived:value=>value,isInteracting:false,isCelebrating:false,sessions:[],
    canvas:{getContext:()=>({})}});
  vm.runInContext(ts.transpile(rendererSource+'\nglobalThis.renderer = new PetRenderer(canvas, "work-blue-cat");'),context);
  for(const [sessions,mood,row] of [
    [[], 'idle',0],
    [[{state:'working',tool_name:'Read'}],'reading',8],
    [[{state:'working',tool_name:'Edit'}],'working',7],
    [[{state:'waiting'}],'waiting',6],
    [[{state:'done'}],'done',3],
  ]) {
    context.sessions=sessions;
    vm.runInContext(ts.transpile(expression),context);
    assert.equal(context.mood,mood);
    context.renderer.setState(context.mood);
    assert.equal(context.renderer.row,row);
  }
});

test('real overlay pointer handler separates controls, tap, drag and cancellation', async()=> {
  const src=readFileSync('src/views/PetOverlay.svelte','utf8');
  const start=src.indexOf('  async function handlePointerDown');
  const body=src.slice(start,src.indexOf('</script>',start));
  const listeners=new Map(); let pets=0, drags=0;
  const context=vm.createContext({isDesktop:true,Date,console,
    handlePetClick:()=>pets++,window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    require:()=>({getCurrentWindow:()=>({startDragging:async()=>drags++})})});
  vm.runInContext(ts.transpile(body,{module:ts.ModuleKind.CommonJS}),context);
  const event=control=>({button:0,clientX:0,clientY:0,target:{closest:()=>control}});
  await context.handlePointerDown(event(true)); assert.equal(listeners.size,0);
  await context.handlePointerDown(event(false)); listeners.get('pointerup')({clientX:0,clientY:0});
  assert.equal(pets,1); assert.equal(drags,0);
  await context.handlePointerDown(event(false)); await listeners.get('pointermove')({clientX:10,clientY:0});
  assert.equal(pets,1); assert.equal(drags,1); assert.equal(listeners.size,0);
  await context.handlePointerDown(event(false)); listeners.get('pointercancel')();
  assert.equal(pets,1); assert.equal(listeners.size,0);
});
