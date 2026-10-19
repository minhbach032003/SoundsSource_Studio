#!/usr/bin/env node

/**
 * Cloudinary Pet Spritesheet Uploader
 * Uploads all local pet spritesheets to Cloudinary CDN to reduce app bundle size.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "mvvfpbof";
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

async function uploadPet(slug, filePath) {
  const publicId = `pets/${slug}/spritesheet`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params = {
    overwrite: "true",
    public_id: publicId,
    timestamp
  };

  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}=${params[k]}`).join("&") + API_SECRET;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const fileBuffer = readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), "spritesheet.webp");
  formData.append("api_key", API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("public_id", publicId);
  formData.append("overwrite", "true");
  formData.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const res = await fetch(endpoint, {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  return data;
}

async function main() {
  const petsDir = "public/pets";
  if (!existsSync(petsDir)) {
    console.error(`Directory not found: ${petsDir}`);
    process.exit(1);
  }

  const entries = readdirSync(petsDir, { withFileTypes: true });
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  console.log(`Found ${slugs.length} pets in ${petsDir}: ${slugs.join(", ")}`);
  console.log(`Target Cloudinary cloud: ${CLOUD_NAME}`);

  let successCount = 0;
  for (const slug of slugs) {
    const filePath = join(petsDir, slug, "spritesheet.webp");
    if (!existsSync(filePath)) {
      console.warn(`[SKIP] ${slug}: spritesheet.webp not found`);
      continue;
    }

    try {
      console.log(`[UPLOADING] ${slug}...`);
      const result = await uploadPet(slug, filePath);
      console.log(`[SUCCESS] ${slug} -> ${result.secure_url}`);
      successCount++;
    } catch (err) {
      console.error(`[FAILED] ${slug}:`, err.message);
    }
  }

  console.log(`\nCompleted: ${successCount}/${slugs.length} pets uploaded.`);
  if (successCount < slugs.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
