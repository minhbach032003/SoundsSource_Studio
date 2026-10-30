import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(invokeOverride) {
  const calls = [];
  const context = vm.createContext({
    $state: v => v, isTauri: () => true,
    invoke: async (name, args) => {
      calls.push({ name, args });
      if (invokeOverride) { const result = invokeOverride(name, args); if (result !== undefined) return result; }
      if (name === 'desktop_set_enabled') return '1';
      if (name === 'desktop_prepare') return { id:'approval-1', target:'Chrome — disposable tab', description:'Đóng tab Chrome' };
      if (name === 'desktop_approve') return { summary:'Tab đã đóng', verified:true };
    },
    toastState: { success() {}, error() {}, info() {} },
    setTimeout, clearTimeout,
  });
  const source = readFileSync('src/lib/desktopControl.svelte.ts','utf8').replace(/^import .*;$/gm,'').replaceAll('export ', '');
  vm.runInContext(ts.transpile(source) + '\nglobalThis.instance = new DesktopController();', context);
  return { state:context.instance, calls };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('desktop action requires opt-in and immutable one-shot approval', async () => {
  const { state, calls } = harness();
  assert.equal((await state.run({kind:'close_chrome_tab'})).ok, false);
  assert.equal(calls.length, 0);
  await state.setEnabled(true);
  const result = state.run({kind:'close_chrome_tab'});
  await tick();
  assert.equal(state.pending.target, 'Chrome — disposable tab');
  assert.ok(!calls.some(c => c.name === 'desktop_approve'));
  await state.approve();
  assert.equal((await result).ok, true);
  assert.equal(calls.find(c => c.name === 'desktop_approve').args.id, 'approval-1');
  await state.approve();
  assert.equal(calls.filter(c => c.name === 'desktop_approve').length, 1);
});

test('disable during native preparation cannot resurrect an approval', async () => {
  let finish;
  const {state, calls} = harness(name => name === 'desktop_prepare' ? new Promise(resolve => finish = resolve) : undefined);
  await state.setEnabled(true);
  const result = state.run({kind:'close_chrome_tab'});
  await tick();
  await state.setEnabled(false);
  finish({id:'late', target:'Chrome', description:'Close'});
  assert.equal((await result).ok, false);
  assert.equal(state.pending, null);
  assert.ok(!calls.some(c => c.name === 'desktop_approve'));
});

test('Chrome fixed script binds tab identity across tab switches, rejects navigation, and verifies closure', () => {
  const closed = [];
  let title = 'Disposable tab';
  let url = 'https://example.invalid/fixture';
  let tabs;
  const tab = { id:() => 7, title:() => title, url:() => url, close:() => { closed.push(7); tabs = tabs.filter(t => t !== tab); } };
  const other = { id:() => 8, title:() => 'Other', url:() => 'other', close:() => closed.push(8) };
  tabs = [tab, other];
  const win = { id:() => 3, activeTab:tab, tabs:() => tabs };
  const windows = () => [win];
  const context = vm.createContext({ Application:() => ({ running:() => true, windows }), delay() {} });
  vm.runInContext(readFileSync('crates/core/src/desktop_chrome.js','utf8'), context);
  const prepared = context.run(['null']);
  win.activeTab = other;
  tabs.reverse();
  url = 'https://example.invalid/changed';
  assert.throws(() => context.run([prepared]), /Tab Chrome/);
  assert.deepEqual(closed, []);
  url = 'https://example.invalid/fixture';
  assert.equal(context.run([prepared]), 'closed');
  assert.deepEqual(closed, [7]);
  assert.throws(() => context.run([prepared]), /Tab Chrome/);
});

test('discovers non-browser desktop apps only with current opt-in, without mutations', async () => {
  const {state,calls} = harness(name => {
    if (name === 'desktop_list_apps') return [{name:'TextEdit',bundle_id:'com.apple.TextEdit'}];
  });
  assert.equal((await state.run({kind:'list_apps'})).ok,false);
  assert.equal(calls.length,0);
  await state.setEnabled(true);
  const result=await state.run({kind:'list_apps'});
  assert.equal(result.ok,true);
  assert.equal(result.data.apps[0].bundle_id,'com.apple.TextEdit');
  assert.equal(state.pending,null);
  assert.ok(!calls.some(c=>c.name==='desktop_prepare'||c.name==='desktop_approve'));
  await state.cancel();
});

test('native permission errors surface without approval or false success', async () => {
  const {state,calls} = harness(name => {
    if (name === 'desktop_prepare') return Promise.reject('Accessibility permission denied');
  });
  await state.setEnabled(true);
  const result = await state.run({kind:'click',bundle_id:'com.apple.TextEdit',x:100,y:100});
  assert.equal(result.ok,false);
  assert.match(state.error,/Accessibility/);
  assert.equal(state.pending,null);
  assert.equal(state.busy,false);
  assert.ok(!calls.some(c=>c.name==='desktop_approve'));
});

test('cancel and concurrent requests never execute native input', async () => {
  const {state, calls} = harness();
  await state.setEnabled(true);
  const result = state.run({kind:'close_chrome_tab'});
  await tick();
  assert.equal((await state.run({kind:'close_chrome_tab'})).ok, false);
  await state.cancel();
  assert.equal((await result).ok, false);
  assert.equal(state.pending, null);
  assert.ok(!calls.some(c => c.name === 'desktop_approve'));
});
