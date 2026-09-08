# Oakland Marine Layer Visualizer — Project Spec

## 1. Purpose

A web app that shows whether the Oakland/Berkeley hills are above or below
the marine layer at a given time, so the user can decide whether a hike will
be in fog or in sun. The app renders a map of the East Bay hills with a
marine-layer overlay, and supports **two data modes via a toggle**:

- **Mode A — HRRR grid (spatial forecast)**: a proxy marine-layer field
  derived from NWS/HRRR gridded forecast data, draped across the map as a
  spatially varying layer (accounts for the marine layer being deeper in
  some areas than others).
- **Mode B — Real sounding (observed, single point)**: the actual KOAK
  radiosonde-observed inversion height (from the ~5am/12Z launch), applied
  as a **flat horizontal plane** over the terrain DEM. Anywhere terrain
  elevation is above that plane is "above the marine layer"; anywhere below
  is "in it." This is a known simplification — a single point observation
  has no spatial variation — and the UI should make that framing explicit
  rather than imply it's a true spatial forecast.

The core exploratory question for Mode B is: **"if I take this morning's
real, observed inversion height and treat it as a flat plane, which parts
of the hills poke above it?"**

## 2. Non-goals

- No claim of high spatial accuracy for Mode B — it's explicitly a
  simplified "flat plane" approximation of a point measurement, and the UI
  must communicate this (see §6).
- No custom vertical-profile GRIB2 parsing for Mode A in v1 — use existing
  derived forecast fields rather than computing inversion height from raw
  HRRR pressure-level data ourselves. This keeps the pipeline light per the
  user's stated preference.
- No user accounts, no historical archive/scrubbing UI in v1 (though the
  data model shouldn't preclude adding this later).
- No mobile app — responsive web only.

## 3. Data Sources

### 3.1 Mode A — HRRR-derived spatial layer (keep this light)

Do **not** fetch/parse raw HRRR GRIB2 files for v1. Instead use
**api.weather.gov (NWS API) gridpoint forecast data**, which already
publishes derived fields as JSON, sourced from the same underlying model
guidance:

- `skyCover` (%) — best available proxy for cloud coverage
- `ceilingHeight` — if available for the relevant office/grid; not always
  populated, so treat as optional/enhancement
- Endpoint pattern: `/points/{lat},{lon}` → resolves to a `/gridpoints/{office}/{gridX},{gridY}/forecast` (or `forecastGridData` for raw hourly grids)

Sample a grid of lat/lon points across the Oakland/Berkeley hills bounding
box (see §4), call the NWS API for each, and build a coverage-percent field
across the map. This avoids any GRIB2/binary parsing entirely and is
well-suited to a lightweight serverless function.

**Fallback / future enhancement**: if NWS gridpoint data proves too coarse
or unreliable for the hills' microclimate, revisit with a proper HRRR pull
(e.g. via Herbie in a Python-runtime Vercel function) — flag this as a
"v2 idea," not required for v1.

### 3.2 Mode B — Real observed sounding

- Source: University of Wyoming sounding archive text-list output
  (`http://weather.uwyo.edu/cgi-bin/sounding`) for station **72493 (OAK)**,
  most recent 12Z (≈5am local) observation.
- Parse the returned plain-text table (columns: PRES, HGHT, TEMP, DWPT,
  RELH, ...).
- **Inversion detection algorithm**: walk down the HGHT column from the
  surface; find the last row where RELH ≈ 100% (allow a small tolerance,
  e.g. ≥97%) before RELH begins a sustained drop. That row's HGHT (meters)
  is the inversion base / marine layer top. This mirrors the manual method
  already validated in this conversation (confirmed against the 8/25/2026
  KOAK sounding: RELH held at 100% through 526m, dropped from 531m —
  inversion height ≈ 1,730 ft).
- Store: `{ date, launchTimeUTC, inversionHeightMeters, inversionHeightFeet, sourceStationId }`
- Only one value is produced per launch (2x/day from KOAK, but the app
  cares about the ~12Z/5am one specifically, matching the user's early-hike
  use case). No need to poll more than once or twice daily for this mode.

### 3.3 Terrain elevation

- Use **Mapbox Terrain-RGB tiles** (since Mapbox GL is already the map
  library — see §5) to get per-pixel elevation client-side, avoiding a
  separate DEM ingestion pipeline. This is the lightest option and keeps
  elevation lookups colocated with map rendering.
- Bounding box: Oakland/Berkeley hills (see §4 for exact coordinates).

## 4. Geographic Scope

Bounding box covering the Oakland/Berkeley hills trail network — e.g.
roughly:
- North: ~37.91 (near Tilden area)
- South: ~37.75 (near Redwood Regional/Chabot area)
- West: ~-122.28 (bay-facing edge, for context/contrast)
- East: ~-122.15 (ridge line / inland edge)

(Exact bounds should be tuned once the map is up — start generous, narrow
later.)

Optionally mark known trailheads as point-of-interest pins (e.g. Sibley,
Redwood Regional, Tilden, Chabot) with their known elevations, so the user
can see at a glance whether a specific trailhead is above/below the layer
in either mode — this is a nice-to-have, not a blocker for v1.

## 5. Architecture

**Stack**: Next.js on Vercel (matches user's existing familiarity/comfort
with Vercel projects).

- **Frontend**: Next.js + Mapbox GL JS.
  - Map of the bounding box in §4.
  - Toggle control (Mode A / Mode B) switching the overlay layer.
  - Mode A: colored raster/choropleth-style overlay from the sampled NWS
    gridpoint coverage values.
  - Mode B: a shaded overlay computed from `terrain elevation vs.
    inversion plane height` — e.g. red/translucent below the plane, clear
    above it. Terrain elevation sourced from Mapbox Terrain-RGB per pixel.
  - Small info panel showing: data timestamp, inversion height (Mode B) or
    forecast valid time (Mode A), and a one-line caveat for Mode B (see
    §6).
- **Backend**: Vercel Serverless Functions, scheduled via **Vercel Cron
  Jobs**.
  - `fetch-hrrr-proxy` — runs periodically (see §7), hits NWS API for each
    sample point in the grid, stores the result.
  - `fetch-sounding` — runs once or twice daily around 12Z, fetches +
    parses the Wyoming text-list sounding, stores the inversion height.
  - Storage: Vercel KV (or Vercel Blob) for the small JSON payloads — no
    need for a full database given the tiny data volume (a handful of
    numbers/grid samples per run).
- **No GitHub Actions needed** — cron lives natively in Vercel per the
  user's stated hosting preference.

## 6. UI / UX Requirements

- Toggle clearly labeled, e.g. **"Forecast (HRRR grid)"** vs. **"This
  morning's real sounding (flat plane)"** — avoid generic labels like "A/B"
  in the actual UI.
- Mode B must include a visible, permanent caveat near the toggle or in the
  legend, e.g.: *"Based on a single real balloon observation at Oakland
  Airport, projected as a flat elevation plane — actual marine layer depth
  varies by location."* This should not be a one-time dismissible tooltip;
  keep it visible whenever Mode B is active.
- Legend explaining the color scale (e.g. "in the marine layer" vs. "above
  it," and for Mode A, coverage % gradient).
- Timestamp of underlying data shown at all times (users should never
  wonder if they're looking at stale data).

## 7. Update Cadence

- Mode A (HRRR/NWS proxy): hourly cron, matching new HRRR-derived
  guidance cycles.
- Mode B (real sounding): once or twice daily, timed after the ~12Z KOAK
  launch is expected to post (allow some buffer, e.g. run at 13Z /
  ~6:30-7am local, and again after the ~00Z launch if useful).
- Frontend always reads the latest stored data on page load — no
  client-side polling required beyond normal page refresh.

## 8. Open Questions for Implementation

- Confirm whether NWS gridpoint `skyCover`/`ceilingHeight` data has enough
  effective resolution over the hills to be visually meaningful at this
  bounding box's scale, or whether it's too coarse/smoothed — evaluate
  early and be ready to fall back to a real HRRR pull if it's a bust.
- Decide exact sample grid density for Mode A (start coarse, e.g. a
  5x5 or 7x7 point grid across the bounding box, given NWS API rate
  considerations).
- Mapbox access token / account setup (assume user will provide).
- Confirm Vercel KV/Blob is available on the user's plan, or fall back to
  committing small JSON files to the repo via the cron function if not.

## 9. Suggested Build Order

1. Static Next.js + Mapbox map of the bounding box, no data yet.
2. Mode B pipeline end-to-end (fetch → parse → store → render flat plane
   vs. terrain), since it's the simpler of the two and was the user's
   primary interest.
3. Mode A pipeline (NWS gridpoint sampling → store → render).
4. Toggle + legend + caveat copy + trailhead pins (nice-to-have).
5. Cron scheduling wired up last, once both pipelines work via manual
   invocation.
