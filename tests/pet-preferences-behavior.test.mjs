import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute production modules, with only the browser platform (clock/canvas/storage) replaced.
const source = ['src/lib/petPreferences.ts', 'src/lib/navigation.ts', 'src/shared/lib/petRenderer.ts']
  .map(path => readFileSync(path, 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '')).join('\n');
function webview(storage = new Map()) {
  let now = 0, id = 0;
  const raf = new Map(), listeners = new Map(), draws = [];
  const window = {
    addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
    dispatchEvent: event => { for (const fn of [...(listeners.get(event.type) || [])]) fn(event); return !event.defaultPrevented; },
  };
  const ctx = { clearRect() {}, drawImage: (...args) => draws.push(args.slice(1)), getImageData() { throw new Error('fixed-grid fixture'); } };
  const context = vm.createContext({
    window, performance: { now: () => now }, crypto: { randomUUID: () => String(++id) },
    StorageEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } preventDefault() { if (this.cancelable) this.defaultPrevented = true; } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    Image: class { naturalWidth = 800; naturalHeight = 900; set src(_) { this.onload?.(); } },
    document: { createElement: () => ({ getContext: () => ctx }) },
    requestAnimationFrame: fn => { const key = ++id; raf.set(key, fn); return key; },
    cancelAnimationFrame: key => raf.delete(key), canvas: { width: 400, height: 400, getContext: () => ctx },
  });
  vm.runInContext(ts.transpile(source + '\nglobalThis.renderer = new PetRenderer(canvas, "work-blue-cat");renderer.load("fixture");'), context);
  return { context, storage, raf, draws,
    run: code => vm.runInContext(code, context),
    tick: time => { now = time; const pending = [...raf.values()]; raf.clear(); pending.forEach(fn => fn(now)); },
    external: (key, value) => { if (value === null) storage.delete(key); else storage.set(key, value); window.dispatchEvent({ type: 'storage', key }); },
  };
}

test('renderer freezes without RAF or frame progression, resumes, and respects authored idle timing', () => {
  const view = webview();
  view.run('renderer.setState("working")');
  view.tick(100); assert.equal(view.context.renderer.frame, 1);
  view.run('writePetPreference("animate", false)');
  assert.equal(view.raf.size, 0);
  const drawCount = view.draws.length;
  view.tick(1000); assert.equal(view.context.renderer.frame, 1); assert.equal(view.draws.length, drawCount);
  view.run('writePetPreference("animate", true);writePetPreference("fps", 1)');
  assert.equal(view.raf.size, 1);
  view.tick(1500); assert.equal(view.context.renderer.frame, 1);
  view.tick(2000); assert.equal(view.context.renderer.frame, 2);
  view.run('writePetPreference("fps", 12)');
  view.tick(2100); assert.equal(view.context.renderer.frame, 3);
  view.run('renderer.setState("idle")');
  view.tick(2200); assert.equal(view.context.renderer.frame, 0);
  view.tick(2300); assert.equal(view.context.renderer.frame, 1);
  assert.equal(view.context.renderer.fps, 6);
  view.run('renderer.destroy();writePetPreference("animate", false);writePetPreference("animate", true)');
  assert.equal(view.raf.size, 0, 'destroy removes storage subscription as well as RAF');
});

test('initial and external storage are validated and live custom bindings refresh without a mood change', () => {
  const view = webview(new Map([['ap_animate_pets','0'],['ap_animation_fps','NaN'],['rust_sound_pet_size','Infinity']]));
  assert.equal(view.raf.size, 0, 'saved freeze starts without a RAF');
  assert.equal(view.run('readPetPreferences().fps'),12);
  assert.equal(view.run('readPetPreferences().size'),180);
  for (const [value, expected] of [['-10',1],['99',12],['1.7',2],['12oops',12],['',12]]) {
    view.external('ap_animation_fps',value); assert.equal(view.run('readPetPreferences().fps'),expected);
  }
  view.external('rust_sound_pet_size','-1'); assert.equal(view.run('readPetPreferences().size'),30);
  view.external('rust_sound_pet_size','500'); assert.equal(view.run('readPetPreferences().size'),300);
  view.run('renderer.setState("working");writePetStorage("ap_bind_work-blue-cat_working", "4")');
  assert.equal(view.context.renderer.row,4);
  assert.equal(view.draws.at(-1)[1],400, 'actual drawn sprite row changes while frozen');
  view.external('ap_bind_work-blue-cat_working','8'); assert.equal(view.context.renderer.row,8);
  view.external('ap_bind_work-blue-cat_working','999'); assert.equal(view.context.renderer.row,7);
  view.external('ap_bind_work-blue-cat_working','2junk'); assert.equal(view.context.renderer.row,7);
  view.external('ap_animation_fps','5'); view.external('ap_animate_pets','1');
  assert.equal(view.raf.size,1); assert.equal(view.context.renderer.fps,5);
  view.tick(201); assert.equal(view.context.renderer.frame,1);
  view.external(null,null); assert.equal(view.context.renderer.row,7);
  view.run('writePetPreference("size", NaN);writePetPreference("fps", 100)');
  assert.equal(view.storage.get('rust_sound_pet_size'),'180'); assert.equal(view.storage.get('ap_animation_fps'),'12');
});

test('overlay resize capability is scoped to its one window and dimensions clamp all input', () => {
  const capability = JSON.parse(readFileSync('crates/app/capabilities/pet-overlay-size.json','utf8'));
  assert.deepEqual(capability.windows,['pet-overlay']);
  assert.deepEqual(capability.permissions,['core:window:allow-set-size']);
  const view = webview();
  for (const [value,width,height] of [[-1,320,275],[80,320,332],[300,377,585],[999,377,585],[NaN,320,447]]) {
    view.context.size = value;
    assert.equal(view.run('petOverlayWindowSize(size).width'),width);
    assert.equal(view.run('petOverlayWindowSize(size).height'),height);
  }
});

test('local Settings and Back survive rejected persistence; external delivery fails meaningfully', async () => {
  const main = webview();
  main.run('globalThis.selected = "pet";subscribeNavigation(tab => selected = tab);localStorage.setItem = () => { throw new Error("storage rejected"); }');
  main.run('navigateTo("pet-settings")'); assert.equal(main.context.selected,'pet-settings');
  main.run('navigateTo("pet")'); assert.equal(main.context.selected,'pet');
  assert.throws(() => main.run('navigateTo("not-a-tab")'),/Invalid navigation/);
  main.run('window.dispatchEvent(new CustomEvent("rust-sound:navigate", {detail:"not-a-tab",cancelable:true}))');
  assert.equal(main.context.selected,'pet','untrusted local payload must be validated');
  const popover = webview();
  popover.run('localStorage.setItem = () => { throw new Error("storage rejected"); };globalThis.calls=[];globalThis.feedback=[];globalThis.invoke=async name=>calls.push(name);globalThis.toastState={error:message=>feedback.push(message)}');
  assert.throws(() => popover.run('navigateTo("pet-settings")'),/storage rejected/);
  const src = readFileSync('src/views/PetPopover.svelte','utf8');
  const handler = src.slice(src.indexOf('  async function handleOpenSettings()'),src.indexOf('\n  function handleQuit()'));
  popover.run(ts.transpile(handler));
  await popover.run('handleOpenSettings()');
  assert.equal(popover.context.calls.length,0,'failed external delivery must not show main or close popover');
  assert.match(popover.context.feedback[0],/Could not open main window:.*storage rejected/);
});

test('navigation request routes current, reused mounted, and newly created main regardless of last tab', () => {
  const storage = new Map([['rust_sound_active_area','spotify']]);
  const popover = webview(storage), main = webview(storage);
  main.run('globalThis.selected = restoreTab();globalThis.stop = subscribeNavigation(tab => selected = tab)');
  assert.equal(main.context.selected,'spotify');
  // Same-window AgentPet Settings action uses the exact same request boundary.
  main.run('navigateTo("pet-settings")'); assert.equal(main.context.selected,'pet-settings');
  main.run('rememberTab("voice");selected="voice"');
  popover.run('navigateTo("pet-settings")');
  main.external('rust_sound_navigation_request',storage.get('rust_sound_navigation_request'));
  assert.equal(main.context.selected,'pet-settings');
  main.run('stop();rememberTab("mixer")');
  popover.run('navigateTo("pet-settings")');
  const newMain = webview(storage);
  assert.equal(newMain.run('takeNavigationRequest() ?? restoreTab()'),'pet-settings');
  assert.equal(newMain.run('restoreTab()'),'pet-settings');
  assert.equal(storage.has('rust_sound_navigation_request'),false,'main consumes pending request');
});
