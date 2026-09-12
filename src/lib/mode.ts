import type { SoundingRecord } from "./types";

export type ViewMode = "hrrr" | "sounding";

export type FetchStatus = "loading" | "empty" | "ready";

/**
 * True once the 12Z launch window has passed for today but the stored
 * sounding is still from a prior day — e.g. the GitHub Actions sweep that
 * fetches it hasn't landed yet (see .github/workflows/fetch-sounding.yml).
 * Doesn't apply to the "empty" status (no data at all), which already has
 * its own retry affordance.
 */
export function isSoundingStale(sounding: SoundingRecord | null, now: Date = new Date()): boolean {
  if (!sounding) return false;
  if (now.getUTCHours() < 12) return false;
  return sounding.launchTimeUTC.slice(0, 10) !== now.toISOString().slice(0, 10);
}
