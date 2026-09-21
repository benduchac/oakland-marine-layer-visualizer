import { get, put } from "@vercel/blob";
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
    // useCache: false — otherwise this reads through Vercel Blob's CDN
    // cache, which can keep serving yesterday's record for a while after
    // the cron's overwrite (see fetch-sounding-cron.sh's note on the same
    // read-after-write lag).
    try {
      const result = await get(key, { access: "private", useCache: false });
      if (!result?.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as T;
    } catch (err) {
      // An unhandled throw here (seen 2026-09-21: the app showed no
      // sounding hours after a confirmed-successful cron write, with
      // nothing recoverable afterward since Vercel only retains 2h of
      // logs) previously surfaced client-side as an opaque 500,
      // indistinguishable from a genuine "nothing stored yet" 404. Logging
      // it here at least makes a repeat diagnosable within that window.
      console.error(`readJSON: Blob read failed for key "${key}"`, err);
      return null;
    }
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
      access: "private",
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
