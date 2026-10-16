import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync('src/views/PetPopover.svelte','utf8');
test('Quit requests application exit, not just closing the popover', async()=> {
  const a=source.indexOf('  function handleQuit()');
  const body=source.slice(a,source.indexOf('</script>',a));
  const calls=[];
  const context=vm.createContext({isDesktop:true,invoke:async command=>calls.push(command),require:()=>({}),window:{close:()=>calls.push('window-close')},toastState:{error:()=>{}}});
  vm.runInContext(ts.transpile(body,{module:ts.ModuleKind.CommonJS}),context);
  await context.handleQuit();
  await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(calls,['quit_app']);
});
