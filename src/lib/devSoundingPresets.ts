// Historical KOAK soundings referenced while building/validating the
// marine-layer detection + onshore-flow/uncertain-cap logic (see
// marine-layer-spec.md and the project's own investigation notes). Kept
// here as the single source of truth for both the dev picker UI and the
// dev-seed route that pre-warms the local cache for all of them.
export interface DevSoundingPreset {
  date: string; // YYYY-MM-DD
  hour: "12" | "0";
  label: string;
}

export const DEV_SOUNDING_PRESETS: DevSoundingPreset[] = [
  { date: "2026-08-25", hour: "12", label: "8/25/26 · reference marine layer (~1,730 ft)" },
  { date: "2026-07-17", hour: "12", label: "7/17/26 · onshore flow near inversion top (under-predicted)" },
  { date: "2026-01-23", hour: "12", label: "1/23/26 · onshore flow within saturated layer (under-predicted)" },
  { date: "2026-05-22", hour: "12", label: "5/22/26 · clear-day control (onshore flag validated non-incident)" },
  { date: "2026-05-29", hour: "12", label: "5/29/26 · thin fog at all elevations (no real cap; uncertain-cap tier)" },
  { date: "2025-12-12", hour: "12", label: "12/12/25 · unresolved mystery (offshore wind, likely inland fog)" },
  { date: "2025-05-16", hour: "12", label: "5/16/25 · real cap, RELH never hits 97% (uncertain-cap validation)" },
  { date: "2025-10-30", hour: "12", label: "10/30/25 · uncertain-cap validated vs. observation" },
  { date: "2025-11-01", hour: "12", label: "11/1/25 · uncertain-cap validated vs. observation" },
];
