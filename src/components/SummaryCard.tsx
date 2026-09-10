import type { SoundingRecord, TrailheadElevation } from "@/lib/types";

interface Status {
  label: string;
  className: string;
}

// The flat-plane model treats the inversion as an exact height, but real
// terrain and the real inversion aren't perfectly flat — a trailhead this
// close to the line could plausibly be on either side of the actual fog top.
const NEAR_FOG_LINE_MARGIN_FT = 100;

// Always based on the sounding/flat-plane model, regardless of which map
// mode is toggled — matches how the InfoPanel's Mode B caveat already frames
// this data, and keeps this card meaningful even while looking at Mode A.
//
// Mirrors MarineLayerMap's selectOverlaySpec: prefer the confirmed reading,
// fall back to the uncertain-cap height when there's no confirmed one, so a
// trailhead near an uncertain cap isn't reported as flatly "Clear" just
// because nothing reached full saturation that morning.
function statusFor(elevationFt: number | null, sounding: SoundingRecord | null): Status {
  if (elevationFt == null) {
    return { label: "…", className: "text-zinc-400 dark:text-zinc-500" };
  }

  const confirmedFt = sounding?.inversionHeightFeet;
  const uncertainFt = sounding?.uncertainCapHeightFeet;
  const activeFt = confirmedFt ?? uncertainFt;
  const isUncertain = confirmedFt == null && uncertainFt != null;

  if (activeFt == null) {
    return { label: "Clear", className: "text-emerald-700 dark:text-emerald-400" };
  }
  if (Math.abs(elevationFt - activeFt) <= NEAR_FOG_LINE_MARGIN_FT) {
    return { label: "Near the fog line", className: "text-amber-700 dark:text-amber-400" };
  }
  if (elevationFt > activeFt) {
    return {
      label: isUncertain ? "Likely above the fog" : "Above the fog",
      className: "text-emerald-700 dark:text-emerald-400",
    };
  }
  return {
    label: isUncertain ? "Likely in the fog" : "In the fog",
    className: "text-red-700 dark:text-red-400",
  };
}

interface SummaryCardProps {
  trailheads: TrailheadElevation[];
  sounding: SoundingRecord | null;
}

export default function SummaryCard({ trailheads, sounding }: SummaryCardProps) {
  if (trailheads.length === 0) return null;

  return (
    <div className="w-full max-w-xs space-y-2 rounded-lg border border-zinc-200 bg-white/95 p-3 text-sm shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What to expect</div>
      <ul className="space-y-1.5">
        {trailheads.map((t) => {
          const status = statusFor(t.elevationFt, sounding);
          return (
            <li key={t.name} className="flex items-center justify-between gap-3">
              <span className="text-zinc-700 dark:text-zinc-200">
                {t.name}
                {t.elevationFt != null && (
                  <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                    {Math.round(t.elevationFt).toLocaleString()} ft
                  </span>
                )}
              </span>
              <span className={`font-medium whitespace-nowrap ${status.className}`}>{status.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
