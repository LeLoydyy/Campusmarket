/**
 * photoStorage.js — where uploaded photos (products, stall logos and covers) are kept.
 *
 *  PHOTO_STORAGE=supabase → Supabase Storage (public bucket). Use this in production:
 *                           most hosts wipe the local disk on every deploy/restart.
 *  otherwise (default)    → local disk (PRODUCT_PHOTO_DIR), served at /api/product-images.
 *
 * Supabase settings: SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PHOTO_BUCKET
 * (default "product-images"). The bucket is created by database/schema.sql when
 * the database is Supabase.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export const productPhotoDirectory = process.env.PRODUCT_PHOTO_DIR || fileURLToPath(new URL("../../uploads/products/", import.meta.url));

export const usingSupabaseStorage = () => process.env.PHOTO_STORAGE === "supabase";

const supabaseConfig = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("PHOTO_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SECRET_KEY.");
  return { url, key, bucket: process.env.SUPABASE_PHOTO_BUCKET || "product-images" };
};

const authHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

const saveToSupabase = async (buffer, objectPath, contentType) => {
  const { url, key, bucket } = supabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": contentType,
      "Cache-Control": "max-age=86400",
      "x-upsert": "false",
    },
    body: buffer,
    signal: AbortSignal.timeout(Number(process.env.PHOTO_UPLOAD_TIMEOUT_MS) || 15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Supabase Storage upload failed (${response.status}): ${detail.slice(0, 200)}`), { status: 502 });
  }
  return `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
};

// Local files stay in one flat directory so URLs keep the /api/product-images/<uuid>.<ext> shape.
const saveToDisk = async (buffer, filename) => {
  await fs.mkdir(productPhotoDirectory, { recursive: true });
  await fs.writeFile(path.join(productPhotoDirectory, filename), buffer, { flag: "wx" });
  return `/api/product-images/${filename}`;
};

/**
 * Store a validated photo and return its public URL.
 * @param {Buffer} buffer
 * @param {{ extension: "png" | "jpg" | "webp", contentType: string }} type
 * @param {"products" | "stalls"} folder  Supabase folder (local disk ignores it)
 */
export const savePhoto = (buffer, { extension, contentType }, folder = "products") => {
  const filename = `${randomUUID()}.${extension}`;
  return usingSupabaseStorage() ? saveToSupabase(buffer, `${folder}/${filename}`, contentType) : saveToDisk(buffer, filename);
};

const LOCAL_URL = /^\/api\/product-images\/([a-f0-9-]+\.(?:png|jpg|webp))$/;

/**
 * Best-effort removal of a photo this app stored, e.g. a replaced stall logo.
 * Anything else (built-in /images/... files, external links) is left alone,
 * and failures are only logged: a leftover file must never block the user.
 */
export const deletePhoto = async (photoUrl) => {
  if (!photoUrl) return;
  try {
    const local = LOCAL_URL.exec(photoUrl);
    if (local) {
      await fs.rm(path.join(productPhotoDirectory, local[1]), { force: true });
      return;
    }
    if (!usingSupabaseStorage()) return;
    const { url, key, bucket } = supabaseConfig();
    const prefix = `${url}/storage/v1/object/public/${bucket}/`;
    if (!photoUrl.startsWith(prefix)) return;
    const response = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { ...authHeaders(key), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [photoUrl.slice(prefix.length)] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.warn(`[photos] Could not delete ${photoUrl}: ${response.status}`);
  } catch (error) {
    console.warn(`[photos] Could not delete ${photoUrl}: ${error.message}`);
  }
};
