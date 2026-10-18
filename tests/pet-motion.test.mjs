import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ['src/lib/petPreferences.ts', 'src/shared/lib/petRenderer.ts']
  .map(path => readFileSync(path, 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '')).join('\n');
function fixture() {
  let now = 0, id = 0;
  const raf = new Map(), events = new Map(), mediaEvents = new Map(), storage = new Map(), draws = [];
  const media = { matches: false, addEventListener: (key, fn) => mediaEvents.set(key, fn), removeEventListener: key => mediaEvents.delete(key) };
  const ctx = { clearRect() {}, drawImage: (...args) => draws.push(args), getImageData() { throw Error('fixed-grid fallback'); } };
  const canvas = { width: 400, height: 400, getContext: () => ctx }; ctx.canvas = canvas;
  const document = { hidden: false, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key), createElement: () => ({ getContext: () => ctx }) };
  const context = vm.createContext({ window: { matchMedia: () => media, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) },
    document, Image: class { naturalWidth = 800; naturalHeight = 900; set src(_) { this.onload?.(); } },
    canvas, performance: { now: () => now }, localStorage: { getItem: key => storage.get(key) ?? null },
    requestAnimationFrame: fn => { raf.set(++id, fn); return id; }, cancelAnimationFrame: key => raf.delete(key) });
  vm.runInContext(ts.transpile(source + '\nglobalThis.renderer = new PetRenderer(canvas, "work-blue-cat"); renderer.load("fixture");'), context);
  return { context, canvas, ctx, document, media, events, mediaEvents, raf, storage, draws,
    run: code => vm.runInContext(code, context), tick: time => { now = time; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(fn => fn(time)); } };
}

test('every shipped pet has a distinct bounded motion profile and an authored resting pose', () => {
  const f = fixture(), pets = readdirSync('public/pets');
  assert.deepEqual(pets.sort(), Array.from(f.run('Object.keys(PET_MOTION)')).sort());
  const profiles = new Set();
  for (const slug of pets) {
    f.context.slug = slug;
    profiles.add(f.run('JSON.stringify(PET_MOTION[slug])'));
    for (let row = 0; row < 9; row++) {
      f.context.row = row;
      const rate = f.run('petAnimationFps(slug, row, 12)');
      assert.ok(rate >= 5 && rate <= 12);
      assert.equal(f.run('petAnimationFps(slug, row, 1)'), 1, 'slider remains a frame-rate cap');
      for (const count of [1, 4, 5, 6, 8]) {
        f.context.count = count;
        for (const step of [0, 1, 9, 1000]) {
          f.context.step = step;
          const frame = f.run('petFrameIndex(slug, row, count, step)');
          assert.ok(frame >= 0 && frame < count);
        }
      }
    }
    assert.equal(f.run('petFrameIndex(slug, 5, 8, 1000)'), f.run('PET_MOTION[slug].restFrame'));
  }
  assert.equal(profiles.size, pets.length, 'no pet is given a copied generic profile');
  assert.deepEqual(Array.from(f.run('Array.from({length: 10}, (_, step) => petFrameIndex("boba", 8, 6, step))')), [0,1,2,3,4,5,4,3,2,1]);
  assert.deepEqual(Array.from(f.run('Array.from({length: 8}, (_, step) => petFrameIndex("boba", 0, 6, step))')), [0,0,0,1,2,3,4,5]);
});

test('slicing preserves grid rows, disconnected limbs, authored offsets and one scale across all states', () => {
  const f = fixture();
  // Three disconnected pieces in one frame must not become three animation frames.
  const width = 80, height = 90, data = new Uint8ClampedArray(width * height * 4);
  for (const [x,y] of [[2,2],[7,6],[13,4],[18,8],[4,25]]) data[(y * width + x) * 4 + 3] = 255;
  f.ctx.getImageData = () => ({ data });
  f.context.image = { naturalWidth: width, naturalHeight: height };
  const clips = f.run('slice(image)');
  assert.equal(clips.length, 9, 'empty rows cannot shift later state bindings');
  assert.equal(clips[0].length, 2);
  assert.equal(clips[1].length, 0);
  assert.equal(clips[2].length, 1);
  const [a,b] = clips[0];
  assert.equal(a.w, b.w); assert.equal(a.h, b.h);
  assert.equal(b.x - a.x, 10); assert.equal(a.y, b.y);
  assert.equal(clips[2][0].y - a.y, 20);
  assert.equal(clips[2][0].h, a.h, 'a short/crouched pose does not get enlarged');
  f.run('renderer.img = image; renderer.clips = slice(image); renderer.draw()');
  const geometry = f.draws.at(-1).slice(5);
  f.run('renderer.row = 2; renderer.draw()');
  assert.deepEqual(f.draws.at(-1).slice(5), geometry);
});

test('clock keeps remainder, starts new states with a full interval and bounds stall catch-up', () => {
  const f = fixture(); f.run('renderer.setState("working")');
  f.tick(100); f.tick(200); f.tick(300);
  assert.equal(f.context.renderer.frame, 3, '11fps must not drift to 10fps');
  f.tick(1100);
  assert.equal(f.context.renderer.frame, 11, 'catch-up is bounded to eight steps');
  f.run('renderer.setState("reading")'); f.tick(1150);
  assert.equal(f.context.renderer.frame, 0, 'new clip must not immediately skip its entry pose');
  f.tick(1350); assert.equal(f.context.renderer.frame, 1);
  const before = f.context.renderer.frame;
  f.events.get('storage')({ key: 'rust_sound_pet_size' }); f.tick(1550);
  assert.equal(f.context.renderer.frame, before + 1, 'unrelated preferences must not reset playback clock');
});

test('live reduced motion and visibility suspend RAF, resume without backlog and clean up', () => {
  const f = fixture(); f.run('renderer.setState("working")'); f.tick(100);
  f.media.matches = true; f.mediaEvents.get('change')();
  assert.equal(f.raf.size, 0); f.tick(10000); assert.equal(f.context.renderer.frame, 1);
  f.media.matches = false; f.mediaEvents.get('change')(); f.tick(10100);
  assert.equal(f.context.renderer.frame, 2);
  f.document.hidden = true; f.events.get('visibilitychange')(); assert.equal(f.raf.size, 0);
  f.tick(20000); f.document.hidden = false; f.events.get('visibilitychange')(); f.tick(20100);
  assert.equal(f.context.renderer.frame, 3);
  f.run('renderer.destroy()');
  assert.equal(f.raf.size, 0); assert.equal(f.mediaEvents.size, 0); assert.equal(f.events.size, 0);
});

test('sampling is restored on every draw and 3D uses smooth scaling without changing pixel pets', () => {
  const f = fixture();
  f.ctx.imageSmoothingEnabled = true; f.run('renderer.draw()');
  assert.equal(f.ctx.imageSmoothingEnabled, false);
  f.canvas.width = 360; f.canvas.height = 360; f.ctx.imageSmoothingEnabled = true; f.run('renderer.draw()');
  assert.equal(f.ctx.imageSmoothingEnabled, false);
  f.run('renderer.setSlug("wode-daodun-3d"); renderer.draw()');
  assert.equal(f.ctx.imageSmoothingEnabled, true);
  const [, , width, height] = f.draws.at(-1).slice(5);
  assert.equal(width, 360); assert.equal(height, 360);
});
