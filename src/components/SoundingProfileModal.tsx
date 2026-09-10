"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { SoundingProfileLevel, SoundingRecord, TrailheadElevation } from "@/lib/types";

interface SoundingProfileModalProps {
  sounding: SoundingRecord;
  trailheads: TrailheadElevation[];
  onClose: () => void;
}

const PROFILE_MAX_FT = 2000;
const HEIGHT_TICKS = [0, 500, 1000, 1500, 2000];
// A confirmed/uncertain reading under this height isn't a real deck (see the
// Dec 12 case: a single saturated surface sample) — render it as plain clear
// rather than an unreadable sliver.
const COLLAPSE_FT = 50;

// Ribbon layout geometry (px). Sized for the modal's max-w-sm card.
const CHART_H = 460;
const LEFT_W = 96;
const BAR_W = 52;
const GAP_SM = 8;
const GUTTER_W = 30;
const TAPE_W = 40;
const GAP_LG = 14;
const OVERLAY_LEFT = LEFT_W;
const OVERLAY_WIDTH = BAR_W + GAP_SM + GUTTER_W + TAPE_W + GAP_LG + GUTTER_W + TAPE_W;

// Fixed data colors — constant across light/dark, matching how the map
// overlay/legend colors already work elsewhere in this app.
const SKY_COLOR = "#1fa3e0";
const STONE_COLOR = "#bcc2be"; // confirmed marine layer — neutral, not warm/tan
const UNCERTAIN_COLOR = "#a7bfcb"; // cool pale blue-gray, deliberately not amber
const STONE_INK = "#26312d";
const UNCERTAIN_INK = "#16303a";

function pixelY(heightFt: number): number {
  const clamped = Math.max(0, Math.min(PROFILE_MAX_FT, heightFt));
  return CHART_H * (1 - clamped / PROFILE_MAX_FT);
}
function pctFromTop(heightFt: number): number {
  return (1 - Math.min(heightFt, PROFILE_MAX_FT) / PROFILE_MAX_FT) * 100;
}

// ---- Color scales ----
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(rgb: number[]): string {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
type ColorStop = [number, string];
function makeScale(stops: ColorStop[]): (v: number) => string {
  return (v) => {
    if (v <= stops[0][0]) return stops[0][1];
    if (v >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [v0, c0] = stops[i];
      const [v1, c1] = stops[i + 1];
      if (v >= v0 && v <= v1) {
        const t = (v - v0) / (v1 - v0);
        const a = hexToRgb(c0);
        const b = hexToRgb(c1);
        return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return stops[stops.length - 1][1];
  };
}

// Deep blue -> white (reference-palette blue sequential steps).
const relhScale = makeScale([
  [20, "#ffffff"],
  [35, "#cde2fb"],
  [55, "#86b6ef"],
  [75, "#3987e5"],
  [90, "#1c5cab"],
  [100, "#0d366b"],
]);
// Tightened to the range Bay Area morning soundings actually occupy (mid-30s
// to low/mid-70s°F) — a wider domain buries nearly every real reading in the
// cool third of the ramp, killing contrast on the exact mornings this matters.
const tempScale = makeScale([
  [40, "#1b6ca8"],
  [48, "#159c86"],
  [55, "#3aa15c"],
  [62, "#8fb93c"],
  [68, "#e0b62e"],
  [74, "#c1392b"],
]);

function buildGradient(rows: SoundingProfileLevel[], pick: (r: SoundingProfileLevel) => number | null, scale: (v: number) => string): string {
  const sorted = [...rows].sort((a, b) => b.heightFeet - a.heightFeet);
  const stops = sorted
    .filter((r) => pick(r) != null)
    .map((r) => `${scale(pick(r) as number)} ${pctFromTop(r.heightFeet).toFixed(2)}%`);
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function nearestRow(rows: SoundingProfileLevel[], heightFt: number): SoundingProfileLevel | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => (Math.abs(r.heightFeet - heightFt) < Math.abs(best.heightFeet - heightFt) ? r : best));
}

/** Evenly spaced heights from top to bottom, inclusive — used for the gutter readouts. */
function sampleHeights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => PROFILE_MAX_FT - (i * PROFILE_MAX_FT) / (n - 1));
}

interface LabelItem {
  key: string;
  y: number;
  text: string;
}
/** Pushes labels down (in ascending-y order) so none sit closer than minGap. */
function declutter(items: LabelItem[], minGap: number): LabelItem[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i] = { ...sorted[i], y: sorted[i - 1].y + minGap };
    }
  }
  return sorted;
}

export default function SoundingProfileModal({ sounding, trailheads, onClose }: SoundingProfileModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const profile = useMemo(
    () => [...(sounding.profile ?? [])].sort((a, b) => a.heightFeet - b.heightFeet),
    [sounding.profile]
  );

  const isUncertainTier = sounding.inversionHeightFeet == null && sounding.uncertainCapHeightFeet != null;
  const rawBandTopFt = sounding.inversionHeightFeet ?? sounding.uncertainCapHeightFeet ?? null;
  const bandTopFt = rawBandTopFt != null && rawBandTopFt >= COLLAPSE_FT ? Math.min(rawBandTopFt, PROFILE_MAX_FT) : null;

  const trailheadLabels = useMemo(() => {
    const items: LabelItem[] = trailheads
      .filter((t): t is TrailheadElevation & { elevationFt: number } => t.elevationFt != null)
      .map((t) => ({ key: t.name, y: pixelY(t.elevationFt), text: t.name }));
    return declutter(items, 15);
  }, [trailheads]);

  const relhGradient = useMemo(() => buildGradient(profile, (r) => r.relh, relhScale), [profile]);
  const tempGradient = useMemo(() => buildGradient(profile, (r) => r.tempF, tempScale), [profile]);
  const tickRows = useMemo(() => sampleHeights(7).map((ft) => ({ ft, row: nearestRow(profile, ft) })), [profile]);

  const minorTicks = Array.from({ length: 19 }, (_, i) => (i + 1) * 100).filter(
    (ft) => ft < PROFILE_MAX_FT && !HEIGHT_TICKS.includes(ft)
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Simplified sounding profile"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Simplified sounding</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">0–2,000 ft, from this morning&apos;s KOAK balloon</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {profile.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No profile data available for this sounding.</p>
        ) : (
          <>
            {/* Ribbon header labels */}
            <div className="mb-1 flex items-end text-[9px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <div style={{ width: LEFT_W }} />
              <div style={{ width: BAR_W }} className="text-center">
                Conditions
              </div>
              <div style={{ width: GAP_SM }} />
              <div style={{ width: GUTTER_W }} />
              <div style={{ width: TAPE_W }} className="whitespace-nowrap text-center">
                Humidity
              </div>
              <div style={{ width: GAP_LG }} />
              <div style={{ width: GUTTER_W }} />
              <div style={{ width: TAPE_W }} className="text-center">
                Temp
              </div>
            </div>

            <div className="relative flex" style={{ height: CHART_H }}>
              {/* Height + trailhead labels */}
              <div className="relative shrink-0" style={{ width: LEFT_W, height: CHART_H }}>
                {HEIGHT_TICKS.map((ft) => (
                  <div
                    key={ft}
                    className="absolute right-2 text-[9px] text-zinc-500 dark:text-zinc-400"
                    style={{ top: pixelY(ft), transform: "translateY(-50%)" }}
                  >
                    {ft === 0 ? "Sea level" : `${ft.toLocaleString()}'`}
                  </div>
                ))}
                {trailheadLabels.map((label) => (
                  <div
                    key={label.key}
                    className="absolute right-2 max-w-[88px] text-right text-[9px] font-semibold leading-tight text-emerald-700 dark:text-emerald-400"
                    style={{ top: label.y, transform: "translateY(-50%)" }}
                  >
                    {label.text}
                  </div>
                ))}
              </div>

              {/* Clear / marine-layer bar (soft blend at the boundary) */}
              <div className="relative shrink-0" style={{ width: BAR_W, height: CHART_H }}>
                <div className="absolute inset-0 overflow-hidden rounded-md border-2 border-zinc-400 dark:border-zinc-500">
                  {bandTopFt != null ? (
                    <>
                      <div
                        className="absolute inset-x-0 top-0 flex items-center justify-center text-center text-[9px] font-bold uppercase leading-tight text-white"
                        style={{
                          height: pixelY(bandTopFt),
                          background: `linear-gradient(to bottom, ${SKY_COLOR} 0%, ${SKY_COLOR} calc(100% - 36px), ${
                            isUncertainTier ? UNCERTAIN_COLOR : STONE_COLOR
                          } 100%)`,
                        }}
                      >
                        Clear
                      </div>
                      <div
                        className="absolute inset-x-0 flex items-start justify-center pt-2.5 text-center text-[9px] font-bold uppercase leading-tight"
                        style={{
                          top: pixelY(bandTopFt),
                          height: CHART_H - pixelY(bandTopFt),
                          background: isUncertainTier ? UNCERTAIN_COLOR : STONE_COLOR,
                          color: isUncertainTier ? UNCERTAIN_INK : STONE_INK,
                        }}
                      >
                        {isUncertainTier ? "Uncertain cap" : "Marine layer"}
                      </div>
                    </>
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-center text-[9px] font-bold uppercase text-white"
                      style={{ background: SKY_COLOR }}
                    >
                      Clear
                    </div>
                  )}
                </div>
                {bandTopFt != null && (
                  <div className="absolute inset-x-0 flex justify-center" style={{ top: pixelY(bandTopFt), transform: "translateY(-50%)" }}>
                    <span className="rounded bg-white/95 px-1 py-0.5 text-[9px] font-semibold text-zinc-800 shadow-sm dark:bg-zinc-900/95 dark:text-zinc-100">
                      {Math.round(bandTopFt).toLocaleString()}&apos;
                    </span>
                  </div>
                )}
              </div>
              <div style={{ width: GAP_SM }} />

              {/* Humidity gutter + gradient tape */}
              <div className="relative shrink-0" style={{ width: GUTTER_W, height: CHART_H }}>
                {tickRows.map(({ ft, row }) => (
                  <div
                    key={ft}
                    className="absolute right-1 text-[9px] tabular-nums text-zinc-600 dark:text-zinc-300"
                    style={{ top: pixelY(ft), transform: "translateY(-50%)" }}
                  >
                    {row?.relh != null ? `${Math.round(row.relh)}%` : "—"}
                  </div>
                ))}
              </div>
              <div
                className="shrink-0 rounded-sm"
                style={{ width: TAPE_W, height: CHART_H, background: relhGradient, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }}
              />
              <div style={{ width: GAP_LG }} />

              {/* Temp gutter + gradient tape */}
              <div className="relative shrink-0" style={{ width: GUTTER_W, height: CHART_H }}>
                {tickRows.map(({ ft, row }) => (
                  <div
                    key={ft}
                    className="absolute right-1 text-[9px] tabular-nums text-zinc-600 dark:text-zinc-300"
                    style={{ top: pixelY(ft), transform: "translateY(-50%)" }}
                  >
                    {row?.tempF != null ? `${Math.round(row.tempF)}°` : "—"}
                  </div>
                ))}
              </div>
              <div
                className="shrink-0 rounded-sm"
                style={{ width: TAPE_W, height: CHART_H, background: tempGradient, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }}
              />

              {/* Meter lines across the bar + gutters + tapes */}
              <div className="pointer-events-none absolute" style={{ left: OVERLAY_LEFT, top: 0, width: OVERLAY_WIDTH, height: CHART_H }}>
                {minorTicks.map((ft) => (
                  <div
                    key={ft}
                    className="absolute inset-x-0"
                    style={{ top: pixelY(ft), height: 1, background: "#20302b", opacity: 0.35, mixBlendMode: "overlay" }}
                  />
                ))}
                {HEIGHT_TICKS.map((ft) => (
                  <div
                    key={ft}
                    className="absolute inset-x-0"
                    style={{ top: pixelY(ft), height: 1.5, background: "#20302b", opacity: 0.55, mixBlendMode: "overlay" }}
                  />
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Based on the same single real balloon observation (KOAK) as the main estimate — actual conditions vary
              by location and can change through the morning.
              {isUncertainTier &&
                " Humidity never reached full saturation, so this cap is a possible reading, not confirmed."}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
