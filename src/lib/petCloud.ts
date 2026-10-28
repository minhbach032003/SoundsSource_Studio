import { INSTALLED_PETS, type PetArchetype } from "@/components/pet/types";

export interface PetCloudAsset { path: string; url: string; bytes: number; sha256: string }
export interface PetCloudEntry { id: string; assets: PetCloudAsset[] }
interface InstalledPet { id: string; assets: { path: string; blob: Blob }[] }

export const PET_CATALOG_URL = "https://res.cloudinary.com/mvvfpbof/raw/upload/pets/catalog.json";
const IMAGE_PREFIX = "https://res.cloudinary.com/mvvfpbof/image/upload/";
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_PET_BYTES = 40 * 1024 * 1024;

export function petAssetPaths(pet: PetArchetype): string[] {
  return [`/pets/${pet.id}/spritesheet.webp`, ...(pet.forms ?? []).flatMap(f => [f.spritesheetPath, f.avatarUrl])];
}

export function validatePetCatalog(value: unknown): PetCloudEntry[] {
  const catalog = value as { schema?: number; pets?: PetCloudEntry[] } | null;
  if (catalog?.schema !== 1 || !Array.isArray(catalog.pets) || catalog.pets.length > INSTALLED_PETS.length) throw new Error("Danh mục pet không hợp lệ.");
  const seen = new Set<string>();
  for (const entry of catalog.pets) {
    const pet = INSTALLED_PETS.find(p => p.id === entry?.id);
    if (!pet || seen.has(entry.id)) throw new Error("Pet không được hỗ trợ hoặc bị trùng.");
    seen.add(entry.id);
    const paths = new Set(petAssetPaths(pet));
    if (!Array.isArray(entry.assets) || entry.assets.length !== paths.size) throw new Error("Gói pet thiếu hình thái.");
    let total = 0;
    for (const asset of entry.assets) {
      if (!asset || !paths.delete(asset.path) || typeof asset.url !== "string" || !asset.url.startsWith(IMAGE_PREFIX)
        || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > MAX_ASSET_BYTES
        || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("Ảnh pet không hợp lệ.");
      const url = new URL(asset.url);
      if (url.search || url.hash || !/^https:\/\/res\.cloudinary\.com\/mvvfpbof\/image\/upload\/v\d+\/pets\/[a-z0-9/-]+\.(webp|png)$/.test(asset.url)
        || !url.pathname.endsWith(asset.path)) throw new Error("Địa chỉ ảnh pet không hợp lệ.");
      total += asset.bytes;
    }
    if (total > MAX_PET_BYTES) throw new Error("Gói pet vượt giới hạn dung lượng.");
  }
  return catalog.pets;
}

async function boundedResponse(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok) throw new Error(`Không tải được pet (HTTP ${response.status}).`);
  if (Number(response.headers.get("content-length")) > limit) throw new Error("Asset size exceeds limit.");
  if (!response.body) throw new Error("Ảnh pet trống.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Asset size exceeds limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function fetchPetCatalog(): Promise<PetCloudEntry[]> {
  const response = await fetch(PET_CATALOG_URL, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  return validatePetCatalog(JSON.parse(new TextDecoder().decode(await boundedResponse(response, 256 * 1024))));
}

export async function downloadPetAssets(entry: PetCloudEntry, progress?: (done: number, total: number) => void): Promise<InstalledPet> {
  validatePetCatalog({ schema: 1, pets: [entry] });
  const assets: InstalledPet["assets"] = [];
  for (const asset of entry.assets) {
    const response = await fetch(asset.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    const bytes = await boundedResponse(response, asset.bytes);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    const png = asset.path.endsWith(".png");
    const validImage = png ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
      : bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
    if (bytes.length !== asset.bytes || digest !== asset.sha256 || !validImage) throw new Error("Asset integrity/image check failed.");
    assets.push({ path: asset.path, blob: new Blob([bytes], { type: png ? "image/png" : "image/webp" }) });
    progress?.(assets.length, entry.assets.length);
  }
  return { id: entry.id, assets };
}

declare global { interface Window { __PET_ASSET_URLS__?: Record<string, string> } }
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rust-sound-pets", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pets", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Đóng cửa sổ app khác rồi thử lại."));
  }).catch(error => { database = undefined; throw error; });
  return database;
}

export function installedPetIds(): string[] {
  return INSTALLED_PETS.filter(p => petAssetPaths(p).every(path => window.__PET_ASSET_URLS__?.[path])).map(p => p.id);
}

function activatePet(record: InstalledPet) {
  const pet = INSTALLED_PETS.find(p => p.id === record.id);
  if (!pet || !Array.isArray(record.assets) || record.assets.length !== petAssetPaths(pet).length) return;
  const paths = new Set(petAssetPaths(pet));
  if (!record.assets.every(a => paths.delete(a.path) && a.blob instanceof Blob && a.blob.size > 0 && a.blob.size <= MAX_ASSET_BYTES)) return;
  const urls: Record<string, string> = {};
  try { for (const asset of record.assets) urls[asset.path] = URL.createObjectURL(asset.blob); }
  catch (error) { Object.values(urls).forEach(url => URL.revokeObjectURL(url)); throw error; }
  const current = window.__PET_ASSET_URLS__ ??= {};
  for (const [path, url] of Object.entries(urls)) {
    if (current[path]) URL.revokeObjectURL(current[path]);
    current[path] = url;
  }
}

export async function restoreInstalledPets(): Promise<void> {
  const db = await openDatabase();
  const records = await new Promise<InstalledPet[]>((resolve, reject) => {
    const request = db.transaction("pets").objectStore("pets").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const active = new Set(installedPetIds());
  records.filter(record => !active.has(record.id)).forEach(activatePet);
  window.dispatchEvent(new Event("pet-assets-changed"));
}

const installing = new Set<string>();
export async function installCloudPet(entry: PetCloudEntry, progress?: (done: number, total: number) => void) {
  if (installing.has(entry.id)) throw new Error("Pet đang được tải.");
  installing.add(entry.id);
  try {
    const record = await downloadPetAssets(entry, progress);
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pets", "readwrite");
      tx.objectStore("pets").put(record);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Không đủ dung lượng để lưu pet."));
      tx.onerror = () => reject(tx.error);
    });
    activatePet(record);
    window.dispatchEvent(new Event("pet-assets-changed"));
    // Storage events reach the other Tauri webviews; the IDB transaction is already committed.
    try { localStorage.setItem("rust_sound_pet_install_revision", crypto.randomUUID()); } catch {}
  } finally { installing.delete(entry.id); }
}

export function subscribePetInstallations() {
  const sync = (event: StorageEvent) => {
    if (event.key === "rust_sound_pet_install_revision") void restoreInstalledPets().catch(console.error);
  };
  window.addEventListener("storage", sync);
  return () => window.removeEventListener("storage", sync);
}
