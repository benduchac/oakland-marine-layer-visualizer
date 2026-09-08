import type { SoundingRecord, TrailheadElevation } from "@/lib/types";

interface Status {
  label: string;
  className: string;
}

// Always based on the sounding/flat-plane model, regardless of which map
// mode is toggled — matches how the InfoPanel's Mode B caveat already frames
// this data, and keeps this card meaningful even while looking at Mode A.
function statusFor(elevationFt: number | null, inversionHeightFt: number | null | undefined): Status {
  if (elevationFt == null) {
    return { label: "…", className: "text-zinc-400 dark:text-zinc-500" };
  }
  if (inversionHeightFt == null) {
    return { label: "Clear", className: "text-emerald-700 dark:text-emerald-400" };
  }
  if (elevationFt > inversionHeightFt) {
    return { label: "Above the fog", className: "text-emerald-700 dark:text-emerald-400" };
  }
  return { label: "In the fog", className: "text-red-700 dark:text-red-400" };
}

interface SummaryCardProps {
  trailheads: TrailheadElevation[];
  sounding: SoundingRecord | null;
}

export default function SummaryCard({ trailheads, sounding }: SummaryCardProps) {
  if (trailheads.length === 0) return null;
  const inversionHeightFt = sounding?.inversionHeightFeet;

  return (
    <div className="w-full max-w-xs space-y-2 rounded-lg border border-zinc-200 bg-white/95 p-3 text-sm shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What to expect</div>
      <ul className="space-y-1.5">
        {trailheads.map((t) => {
          const status = statusFor(t.elevationFt, inversionHeightFt);
          return (
            <li key={t.name} className="flex items-center justify-between gap-3">
              <span className="text-zinc-700 dark:text-zinc-200">{t.name}</span>
              <span className={`font-medium whitespace-nowrap ${status.className}`}>{status.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
