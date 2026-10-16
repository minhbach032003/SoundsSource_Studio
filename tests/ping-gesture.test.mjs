import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real gesture class; only Svelte's rune and the audio boundary are stubbed.
const source = readFileSync('src/lib/lolPingGesture.svelte.ts', 'utf8').replace(/^import .*playSectorTick.*\n/m, '');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(trigger = 'alt') {
  const listeners = new Map();
  const window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const context = { exports: {}, window, $state: value => value, playSectorTick() {} };
  vm.runInNewContext(js, context);
  const machine = new context.exports.LolPingGestureMachine();
  const dispatched = [];
  machine.init({ tacticalTrigger: trigger, emoteTrigger: 'ctrl', dragThreshold: 65, clickPing: true, tickSound: false, volume: 50, onDispatch: value => dispatched.push(value), onQuickPing: () => dispatched.push('quick') });
  const send = (type, values = {}) => listeners.get(type)?.({ key: '', code: '', button: 0, clientX: 100, clientY: 100, target: null, preventDefault() {}, ...values });
  return { machine, dispatched, send };
}
for (const key of ['Alt', 'g']) {
  const { machine, dispatched, send } = setup(key.toLowerCase());
  send('keydown', { key });
  assert.equal(machine.isHolding, false, 'key alone must not show wheel');
  send('mousemove', { clientX: 300 });
  send('keyup', { key });
  assert.equal(dispatched.length, 0, 'key-only movement must not ping');
  send('keydown', { key });
  send('mousedown', { altKey: key === 'Alt' });
  assert.equal(machine.isHolding, false, 'left-down only arms pending gesture');
  send('mouseup');
  assert.equal(dispatched.length, 0, 'undragged click must not quick ping');
  send('mousedown', { altKey: key === 'Alt' });
  send('mousemove', { clientX: 160 });
  assert.equal(machine.isHolding, false, 'must respect configured threshold, not clamp it');
  send('mousemove', { clientX: 200 });
  assert.equal(machine.isHolding, true);
  assert.equal(machine.activeSlice, 2);
  send('mouseup', { clientX: 200 });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].sliceIndex, 2);
  send('mousedown', { altKey: key === 'Alt' });
  send('mousemove', { clientY: 0 });
  send('keyup', { key });
  send('mouseup', { clientY: 0 });
  assert.equal(dispatched.length, 1, 'key release first must cancel');
  for (const cancel of ['blur', 'contextmenu']) {
    send('keydown', { key }); send('mousedown', { altKey: key === 'Alt' });
    send('mousemove', { clientY: 0 }); send(cancel); send('mouseup');
    assert.equal(dispatched.length, 1, `${cancel} must cancel`);
  }
  machine.destroy();
}
{
  const { machine, dispatched, send } = setup();
  send('keydown', { key: 'Control' });
  send('mousedown', { ctrlKey: true }); send('mousemove', { clientY: 0 });
  send('mouseup', { clientY: 0 });
  assert.equal(dispatched[0].mode, 'emote');
  assert.equal(dispatched[0].sliceIndex, 0);
  for (const cancel of ['Escape', 'right', 'center']) {
    send('mousedown', { ctrlKey: true }); send('mousemove', { clientX: 200 });
    if (cancel === 'Escape') send('keydown', { key: 'Escape' });
    if (cancel === 'right') send('mousedown', { button: 2 });
    send('mouseup');
    assert.equal(dispatched.length, 1, `${cancel} cancels without ping`);
  }
  machine.destroy();
}
console.log('Keyboard + left drag gesture checks passed');
