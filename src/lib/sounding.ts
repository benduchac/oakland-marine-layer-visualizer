import { KOAK_STATION_ID } from "./geo";
import type { SoundingRecord } from "./types";

// University of Wyoming upper-air sounding archive. The old
// weather.uwyo.edu cgi-bin endpoint now 302s to this host and a rewritten
// /wsgi/sounding endpoint (confirmed live 2026-09-08); params match the
// request the site's own form builds via onSubmit() in sounding.shtml.
const SOUNDING_ENDPOINT = "https://weather.arcc.uwyo.edu/wsgi/sounding";

export interface SoundingRow {
  pressureHpa: number;
  heightM: number;
  tempC: number | null;
  dewpointC: number | null;
  relh: number | null;
  drctDeg: number | null;
  spedMs: number | null;
}

// The profile table uses fixed 7-character-wide columns (verified against a
// live response), not whitespace-delimited fields — some columns (DWPT/RELH
// at upper levels) can be entirely blank, which whitespace-splitting would
// misalign. MIXR is parsed only to keep the fixed-width offsets aligned for
// the DRCT/SPED columns after it — its value itself is unused.
const COLUMN_WIDTH = 7;
const COLUMNS = ["pressureHpa", "heightM", "tempC", "dewpointC", "relh", "mixr", "drctDeg", "spedMs"] as const;

function parseField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseSoundingTable(html: string): SoundingRow[] {
  const preMatch = /<PRE>([\s\S]*?)<\/PRE>/i.exec(html);
  if (!preMatch) return [];
  const lines = preMatch[1].split("\n");

  const rows: SoundingRow[] = [];
  for (const line of lines) {
    // Data rows start with a (possibly negative) numeric pressure value;
    // this skips the header, unit, and dashed-rule lines.
    if (!/^\s*-?\d/.test(line)) continue;

    const values: Record<string, number | null> = {};
    COLUMNS.forEach((name, i) => {
      values[name] = parseField(line.slice(i * COLUMN_WIDTH, (i + 1) * COLUMN_WIDTH));
    });

    if (values.pressureHpa == null || values.heightM == null) continue;
    rows.push({
      pressureHpa: values.pressureHpa,
      heightM: values.heightM,
      tempC: values.tempC,
      dewpointC: values.dewpointC,
      relh: values.relh,
      drctDeg: values.drctDeg,
      spedMs: values.spedMs,
    });
  }
  return rows;
}

const RELH_SATURATION_THRESHOLD = 97;
// Fallback threshold when nothing reaches full saturation. Confirmed against
// two real cases (2025-05-16, 2026-05-29) where RELH plateaued in the
// high-80s/low-90s without ever crossing 97 — 85 lands in a stable spot for
// both (80 was too loose and picked up unrelated moisture near the top of
// the search window instead of the real cap).
const UNCERTAIN_RELH_THRESHOLD = 85;
// How many rows above a sub-threshold reading to check for recovery before
// treating the drop as sustained rather than a single noisy sample.
const SUSTAINED_DROP_LOOKAHEAD = 2;
// Bounds the search to plausible marine-layer depths for these hills (the
// tallest terrain in the bounding box is ~580m). A real winter case showed a
// shallow ~30m surface fog patch sitting below the actual stratus deck — if
// the search stopped at the first saturated run it'd report that patch's top
// (a few meters) instead of the real deck a few hundred meters higher. This
// cap keeps the search from also swinging too far the other way and picking
// up unrelated mid-level moisture as if it were the marine layer.
const MAX_SEARCH_HEIGHT_M = 1200;

// Range for the simplified sounding profile shown to users (0-2000ft) —
// covers the full plausible marine-layer depth plus headroom above it, per
// MAX_SEARCH_HEIGHT_M, without dragging in unrelated upper-air data.
const PROFILE_MAX_HEIGHT_M = 610; // 2000ft

/** Rows for the simplified profile view, trimmed to PROFILE_MAX_HEIGHT_M and sorted low-to-high. */
function buildProfile(rows: SoundingRow[]): SoundingRow[] {
  return rows.filter((r) => r.heightM <= PROFILE_MAX_HEIGHT_M).sort((a, b) => a.heightM - b.heightM);
}

/**
 * Scans up from the surface for every run of rows where RELH stays >= the
 * given threshold, and returns the top of the *highest* such run — not the
 * first. A shallow surface-based fog patch (common on still winter mornings)
 * can be saturated and end well below the real stratus deck sitting above
 * it; taking the first run would report the patch's top instead of the
 * deck's. Returns null if the profile never reaches the threshold within
 * MAX_SEARCH_HEIGHT_M.
 */
function findSaturatedRunTopM(rows: SoundingRow[], thresholdPercent: number): number | null {
  const sorted = [...rows]
    .filter((r) => r.heightM <= MAX_SEARCH_HEIGHT_M)
    .sort((a, b) => a.heightM - b.heightM);

  let highestRunTop: number | null = null;
  let currentRunTop: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (row.relh == null) continue;

    if (row.relh >= thresholdPercent) {
      currentRunTop = row.heightM;
      continue;
    }

    if (currentRunTop == null) continue; // haven't hit the threshold yet at all

    const lookahead = sorted.slice(i + 1, i + 1 + SUSTAINED_DROP_LOOKAHEAD);
    const recovers = lookahead.some((r) => r.relh != null && r.relh >= thresholdPercent);
    if (recovers) continue; // brief dip within the same run, not the end of it

    // Sustained drop: this run has ended. Keep it (overwriting any prior,
    // lower run) and keep scanning upward for a possibly higher one.
    highestRunTop = currentRunTop;
    currentRunTop = null;
  }

  // The profile can still be saturated at the edge of the search window.
  if (currentRunTop != null) highestRunTop = currentRunTop;

  return highestRunTop;
}

/** Inversion base / marine layer top, per spec §3.2 — the confirmed (RELH >= 97) reading. */
export function findInversionHeightM(rows: SoundingRow[]): number | null {
  return findSaturatedRunTopM(rows, RELH_SATURATION_THRESHOLD);
}

/**
 * Fallback for mornings where nothing reaches full saturation but the
 * profile still shows a real moist layer (e.g. thin/patchy fog nearby, or a
 * balloon that just missed the densest part of the layer) — only meaningful
 * when findInversionHeightM already returned null. Not a substitute for the
 * confirmed reading: report this to users as an uncertain possibility, not
 * a detected marine layer.
 */
export function findUncertainCapHeightM(rows: SoundingRow[]): number | null {
  return findSaturatedRunTopM(rows, UNCERTAIN_RELH_THRESHOLD);
}

// Onshore quadrant (wind blowing FROM the Pacific/Golden Gate gap toward the
// hills) and a speed high enough to be actively advecting air, not just
// drifting. Confirmed against two real cases where the flat-plane model
// under-predicted marine layer extent on the hills: 2026-07-17 (a westerly
// jet just above the detected inversion top) and 2026-01-23 (onshore flow
// already active within the saturated layer itself, near its top).
const ONSHORE_MIN_DEG = 190;
const ONSHORE_MAX_DEG = 330;
const ONSHORE_MIN_SPEED_MS = 3;
// How far below/above the inversion top to look — wide enough to catch
// onshore flow either within the layer's upper reaches or in a jet sitting
// just above it, per the two cases above.
const ONSHORE_SEARCH_BAND_M = 300;

/**
 * Flags onshore wind near the inversion top as a caveat, not a correction:
 * we don't attempt to model how much higher such flow might push the fog,
 * just surface that the flat-plane estimate is more likely to be an
 * understatement on windward slopes this morning.
 */
export function detectOnshoreFlowNearInversion(rows: SoundingRow[], inversionHeightM: number | null): boolean {
  if (inversionHeightM == null) return false;

  const lo = Math.max(0, inversionHeightM - ONSHORE_SEARCH_BAND_M);
  const hi = inversionHeightM + ONSHORE_SEARCH_BAND_M;

  return rows.some(
    (r) =>
      r.heightM >= lo &&
      r.heightM <= hi &&
      r.spedMs != null &&
      r.spedMs >= ONSHORE_MIN_SPEED_MS &&
      r.drctDeg != null &&
      r.drctDeg >= ONSHORE_MIN_DEG &&
      r.drctDeg <= ONSHORE_MAX_DEG
  );
}

function formatDatetimeParam(date: Date, hourUTC: number): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(hourUTC).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:00:00`;
}

export interface LatestSounding {
  launchTimeUTC: string;
  inversionHeightMeters: number | null;
  uncertainCapHeightMeters: number | null;
  onshoreFlowNearInversion: boolean;
  profile: SoundingRow[];
}

const METERS_TO_FEET = 3.28084;
const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;

/** Builds the full SoundingRecord shape (unit conversions + profile) shared by the cron, dev-preview, and dev-seed routes. */
export function buildSoundingRecord(stationId: string, result: LatestSounding): SoundingRecord {
  return {
    stationId,
    launchTimeUTC: result.launchTimeUTC,
    inversionHeightMeters: result.inversionHeightMeters,
    inversionHeightFeet: result.inversionHeightMeters != null ? result.inversionHeightMeters * METERS_TO_FEET : null,
    uncertainCapHeightMeters: result.uncertainCapHeightMeters,
    uncertainCapHeightFeet:
      result.uncertainCapHeightMeters != null ? result.uncertainCapHeightMeters * METERS_TO_FEET : null,
    onshoreFlowNearInversion: result.onshoreFlowNearInversion,
    fetchedAt: new Date().toISOString(),
    profile: result.profile.map((row) => ({
      heightFeet: row.heightM * METERS_TO_FEET,
      tempF: row.tempC != null ? celsiusToFahrenheit(row.tempC) : null,
      dewpointF: row.dewpointC != null ? celsiusToFahrenheit(row.dewpointC) : null,
      relh: row.relh,
    })),
  };
}

/** Fetches + parses a single KOAK launch for an arbitrary date/hour. */
export async function fetchSoundingForLaunch(launchDate: Date, hourUTC: number): Promise<LatestSounding | null> {
  const datetimeParam = formatDatetimeParam(launchDate, hourUTC);

  const url = new URL(SOUNDING_ENDPOINT);
  url.searchParams.set("datetime", datetimeParam);
  url.searchParams.set("id", KOAK_STATION_ID);
  url.searchParams.set("type", "TEXT:LIST");
  url.searchParams.set("src", "UNKNOWN");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;

  const html = await res.text();
  const rows = parseSoundingTable(html);
  if (rows.length === 0) return null;

  const inversionHeightMeters = findInversionHeightM(rows);

  return {
    launchTimeUTC: `${datetimeParam.replace(" ", "T")}Z`,
    inversionHeightMeters,
    uncertainCapHeightMeters: inversionHeightMeters == null ? findUncertainCapHeightM(rows) : null,
    onshoreFlowNearInversion: detectOnshoreFlowNearInversion(rows, inversionHeightMeters),
    profile: buildProfile(rows),
  };
}

/**
 * Fetches the most recent ~12Z (5am local) KOAK sounding. Tries today's
 * launch first, then falls back to yesterday's in case today's hasn't
 * posted yet (the app cares specifically about the early-morning launch —
 * spec §3.2).
 */
export async function fetchLatestSounding(): Promise<LatestSounding | null> {
  const now = new Date();

  for (const daysAgo of [0, 1]) {
    const launchDate = new Date(now);
    launchDate.setUTCDate(launchDate.getUTCDate() - daysAgo);
    const result = await fetchSoundingForLaunch(launchDate, 12);
    if (result) return result;
  }

  return null;
}
