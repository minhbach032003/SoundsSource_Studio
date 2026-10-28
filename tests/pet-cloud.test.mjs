import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const types = ts.transpile(readFileSync('src/components/pet/types.ts', 'utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*["']@lucide\/svelte["'];?/, 'const Utensils={},Trophy={},Crown={},Zap={},Flame={},PawPrint={},Compass={},Shield={},Award={},Sparkles={},Medal={},Calendar={},Moon={};'));
const context = vm.createContext({ exports: {}, Blob, URL, crypto: webcrypto, AbortSignal, window: {}, console });
vm.runInContext(types, context);
context.INSTALLED_PETS = context.exports.INSTALLED_PETS;
const source = readFileSync('src/lib/petCloud.ts', 'utf8').replace(/^import .*;\n/gm, '');
vm.runInContext(ts.transpile(source), context);
const api = context.exports;
const pet = api.INSTALLED_PETS[0];
const bytes = new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80]);
const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
const entry = { id: pet.id, assets: api.petAssetPaths(pet).map(path => ({ path, url: `https://res.cloudinary.com/mvvfpbof/image/upload/v1${path}`, bytes: bytes.length, sha256: hash })) };

test('catalog accepts complete supported pets, empty list; rejects unsafe, incomplete and oversized content', () => {
  assert.equal(api.validatePetCatalog({ schema: 1, pets: [entry] }).length, 1);
  assert.equal(api.validatePetCatalog({ schema: 1, pets: [] }).length, 0);
  for (const changed of [
    { ...entry, id: '../escape' }, { ...entry, assets: entry.assets.slice(1) },
    { ...entry, assets: entry.assets.map((a,i) => i ? a : { ...a, url: 'https://evil.test/sheet.webp' }) },
    { ...entry, assets: entry.assets.map((a,i) => i ? a : { ...a, path: `/pets/${pet.id}/../escape` }) },
    { ...entry, assets: entry.assets.map((a,i) => i ? a : { ...a, bytes: 100_000_000 }) },
  ]) assert.throws(() => api.validatePetCatalog({ schema: 1, pets: [changed] }));
  assert.throws(() => api.validatePetCatalog({ schema: 1, pets: [entry, entry] }));
});

test('downloader verifies every asset before returning a complete record and rejects partial or corrupt data', async () => {
  // Fixtures use real format-specific bytes and matching digests.
  const assets = await Promise.all(entry.assets.map(async asset => {
    const data = asset.path.endsWith('.png') ? new Uint8Array([137,80,78,71,13,10,26,10]) : bytes;
    return { ...asset, bytes: data.length, sha256: Buffer.from(await webcrypto.subtle.digest('SHA-256', data)).toString('hex') };
  }));
  const valid = { ...entry, assets };
  let calls = 0;
  context.fetch = async url => { const asset = assets.find(a => a.url === url); calls++; return new Response(asset.path.endsWith('.png') ? new Uint8Array([137,80,78,71,13,10,26,10]) : bytes); };
  const progress = [];
  const record = await api.downloadPetAssets(valid, (done,total) => progress.push([done,total]));
  assert.equal(record.assets.length, 21);
  assert.equal(calls, 21);
  assert.deepEqual(Array.from(progress.at(-1)), [21,21]);
  context.fetch = async () => new Response('not an image');
  await assert.rejects(api.downloadPetAssets(valid), /size|integrity|image/i);
  context.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(api.downloadPetAssets(valid), /404/);
});
