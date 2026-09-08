import { KOAK_STATION_ID } from "./geo";

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
}

// The profile table uses fixed 7-character-wide columns (verified against a
// live response), not whitespace-delimited fields — some columns (DWPT/RELH
// at upper levels) can be entirely blank, which whitespace-splitting would
// misalign.
const COLUMN_WIDTH = 7;
const COLUMNS = ["pressureHpa", "heightM", "tempC", "dewpointC", "relh"] as const;

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
    });
  }
  return rows;
}

const RELH_SATURATION_THRESHOLD = 97;
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

/**
 * Inversion base / marine layer top, per spec §3.2: scans up from the
 * surface for every run of rows where RELH stays >= ~97%, and returns the
 * top of the *highest* such run — not the first. A shallow surface-based fog
 * patch (common on still winter mornings) can be saturated and end well
 * below the real stratus deck sitting above it; taking the first run would
 * report the patch's top instead of the deck's. Returns null if the profile
 * never reaches saturation within MAX_SEARCH_HEIGHT_M (i.e. no marine layer
 * / stratus deck this morning) — a legitimate result, not a parse failure.
 */
export function findInversionHeightM(rows: SoundingRow[]): number | null {
  const sorted = [...rows]
    .filter((r) => r.heightM <= MAX_SEARCH_HEIGHT_M)
    .sort((a, b) => a.heightM - b.heightM);

  let highestRunTop: number | null = null;
  let currentRunTop: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (row.relh == null) continue;

    if (row.relh >= RELH_SATURATION_THRESHOLD) {
      currentRunTop = row.heightM;
      continue;
    }

    if (currentRunTop == null) continue; // haven't hit saturation yet at all

    const lookahead = sorted.slice(i + 1, i + 1 + SUSTAINED_DROP_LOOKAHEAD);
    const recovers = lookahead.some((r) => r.relh != null && r.relh >= RELH_SATURATION_THRESHOLD);
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

  return {
    launchTimeUTC: `${datetimeParam.replace(" ", "T")}Z`,
    inversionHeightMeters: findInversionHeightM(rows),
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
