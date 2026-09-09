import { list, put } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

// Small JSON payloads only (a handful of numbers/grid samples per run — spec
// §5), so a single blob/file per logical key is enough; no database needed.
// Falls back to local JSON files under .data/ when no Blob store is
// configured (local dev, or per spec §8's stated fallback).
const LOCAL_DATA_DIR = path.join(process.cwd(), ".data");

function blobConfigured(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function readJSON<T>(key: string): Promise<T | null> {
  if (blobConfigured()) {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key) ?? blobs[0];
    if (!match) return null;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  }

  try {
    const filePath = path.join(LOCAL_DATA_DIR, key);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJSON(key: string, data: unknown): Promise<void> {
  if (blobConfigured()) {
    await put(key, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  const filePath = path.join(LOCAL_DATA_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
