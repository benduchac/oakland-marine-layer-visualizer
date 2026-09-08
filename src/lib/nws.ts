import type { GridSample } from "./types";
import type { LatLon } from "./geo";

// api.weather.gov requires an identifying User-Agent (contact info per their
// usage policy); override with a real contact via env if you have one.
const USER_AGENT = process.env.NWS_USER_AGENT ?? "(marine-layer-visualizer, set NWS_USER_AGENT env var)";

const headers = {
  "User-Agent": USER_AGENT,
  Accept: "application/geo+json",
};

interface GridpointRef {
  gridId: string;
  gridX: number;
  gridY: number;
}

async function resolveGridpoint(point: LatLon): Promise<GridpointRef | null> {
  const url = `https://api.weather.gov/points/${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  const { gridId, gridX, gridY } = data.properties ?? {};
  if (!gridId || gridX == null || gridY == null) return null;
  return { gridId, gridX, gridY };
}

// Parses a subset of ISO 8601 durations (PnDTnHnMnS) sufficient for the
// PT1H / PT18H style durations NWS grid data uses.
function parseIsoDurationMs(duration: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  const dayMs = Number(days ?? 0) * 24 * 60 * 60 * 1000;
  const hourMs = Number(hours ?? 0) * 60 * 60 * 1000;
  const minuteMs = Number(minutes ?? 0) * 60 * 1000;
  const secondMs = Number(seconds ?? 0) * 1000;
  return dayMs + hourMs + minuteMs + secondMs;
}

interface GridLayerValue {
  validTime: string;
  value: number;
}

interface GridLayer {
  values?: GridLayerValue[];
}

/** Picks the value whose validTime interval contains "now", falling back to the first entry. */
function currentValueFromLayer(layer: GridLayer | undefined): number | null {
  if (!layer?.values?.length) return null;
  const now = Date.now();
  for (const entry of layer.values) {
    const [start, durationIso] = entry.validTime.split("/");
    const startMs = Date.parse(start);
    const durationMs = parseIsoDurationMs(durationIso);
    if (Number.isFinite(startMs) && now >= startMs && now < startMs + durationMs) {
      return entry.value;
    }
  }
  return layer.values[0]?.value ?? null;
}

async function fetchGridSample(point: LatLon): Promise<GridSample> {
  const empty: GridSample = { ...point, skyCoverPercent: null, ceilingHeightMeters: null };

  const gridpoint = await resolveGridpoint(point);
  if (!gridpoint) return empty;

  const res = await fetch(`https://api.weather.gov/gridpoints/${gridpoint.gridId}/${gridpoint.gridX},${gridpoint.gridY}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return empty;

  const data = await res.json();
  return {
    ...point,
    skyCoverPercent: currentValueFromLayer(data.properties?.skyCover),
    ceilingHeightMeters: currentValueFromLayer(data.properties?.ceilingHeight),
  };
}

/**
 * Samples NWS gridpoint forecast data (skyCover / ceilingHeight) across a
 * set of points — spec §3.1's lightweight proxy for HRRR-derived guidance,
 * avoiding any GRIB2 parsing. Points are fetched sequentially with a small
 * delay to stay well within NWS API rate expectations.
 */
export async function sampleGridPoints(points: LatLon[]): Promise<GridSample[]> {
  const samples: GridSample[] = [];
  for (const point of points) {
    samples.push(await fetchGridSample(point));
  }
  return samples;
}
