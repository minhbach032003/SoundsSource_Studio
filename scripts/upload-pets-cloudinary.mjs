#!/usr/bin/env node
// Publish images first and replace the public catalog only after every image succeeds.
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

export function buildPetCatalog() {
  const source = readFileSync("src/components/pet/types.ts", "utf8").replace(/import\s*\{([\s\S]*?)\}\s*from\s*["']@lucide\/svelte["'];?/, (_, names) => `const ${names.split(',').map(n => `${n.trim()}={}`).join(',')};`);
  const context = vm.createContext({ exports: {} });
  vm.runInContext(ts.transpile(source), context);
  return { schema: 1, pets: Array.from(context.exports.INSTALLED_PETS, pet => ({
    id: pet.id,
    assets: [`/pets/${pet.id}/spritesheet.webp`, ...pet.forms.flatMap(f => [f.spritesheetPath, f.avatarUrl])].map(path => {
      const bytes = readFileSync(`public${path}`);
      return { path, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
    }),
  })) };
}

async function upload(publicId, bytes, resourceType, config) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = { invalidate: "true", overwrite: "true", public_id: publicId, timestamp };
  const signature = crypto.createHash("sha1").update(Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&") + config.secret).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([bytes]), publicId.split("/").at(-1));
  form.append("api_key", config.key);
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloud}/${resourceType}/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Cloudinary upload failed (HTTP ${response.status}); catalog unchanged.`);
  return result.secure_url;
}

export async function main() {
  const catalog = buildPetCatalog();
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ pets: catalog.pets.length, assets: catalog.pets.reduce((n,p) => n + p.assets.length, 0), bytes: catalog.pets.reduce((n,p) => n + p.assets.reduce((s,a) => s + a.bytes, 0), 0) }));
    return;
  }
  if (existsSync(".env")) process.loadEnvFile(".env");
  const config = { cloud: process.env.CLOUDINARY_CLOUD_NAME || "mvvfpbof", key: process.env.CLOUDINARY_API_KEY, secret: process.env.CLOUDINARY_API_SECRET };
  if (config.cloud !== "mvvfpbof") throw new Error("Cloud name must match the application's configured catalog.");
  if (!config.key || !config.secret) throw new Error("Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET before publishing.");
  for (const pet of catalog.pets) {
    for (const asset of pet.assets) {
      // Image public IDs omit extensions; raw JSON public IDs retain them.
      const publicId = asset.path.slice(1).replace(/\.(webp|png)$/, "");
      asset.url = await upload(publicId, readFileSync(`public${asset.path}`), "image", config);
      console.log(`Uploaded ${asset.path}`);
    }
  }
  const url = await upload("pets/catalog.json", Buffer.from(JSON.stringify(catalog)), "raw", config);
  console.log(`Published ${catalog.pets.length} companions: ${url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
