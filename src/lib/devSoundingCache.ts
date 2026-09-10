import { promises as fs } from "fs";
import path from "path";

// Dev-only cache of fetched historical soundings, so re-loading a preset
// (or reloading the app during dev) doesn't hit the live Wyoming archive
// every time — that fetch alone regularly takes 10-15s. Always local files,
// never Blob storage (unlike lib/storage.ts): this is throwaway dev data
// that should never end up in the production store, matched or not by
// whether a Blob store happens to be configured locally.
const CACHE_DIR = path.join(process.cwd(), ".data", "dev-sounding-cache");

function cacheFile(date: string, hourUTC: number): string {
  return path.join(CACHE_DIR, `${date}_${hourUTC}Z.json`);
}

export async function readCachedSounding<T>(date: string, hourUTC: number): Promise<T | null> {
  try {
    const raw = await fs.readFile(cacheFile(date, hourUTC), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCachedSounding(date: string, hourUTC: number, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile(date, hourUTC), JSON.stringify(data, null, 2), "utf-8");
}
