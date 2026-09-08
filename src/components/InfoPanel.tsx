import Legend from "./Legend";
import type { ViewMode } from "@/lib/mode";
import type { HrrrProxyRecord, SoundingRecord } from "@/lib/types";

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface InfoPanelProps {
  mode: ViewMode;
  sounding: SoundingRecord | null;
  hrrr: HrrrProxyRecord | null;
  isDevOverride?: boolean;
}

export default function InfoPanel({ mode, sounding, hrrr, isDevOverride }: InfoPanelProps) {
  return (
    <div className="w-full max-w-sm space-y-3 rounded-lg border border-zinc-200 bg-white/95 p-4 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      {mode === "sounding" ? (
        <>
          {isDevOverride && (
            <div className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              DEV PREVIEW — not live data
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Launch time (KOAK, 12Z)</div>
            <div className="font-medium">{formatTimestamp(sounding?.launchTimeUTC)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Inversion height</div>
            <div className="font-medium">
              {sounding?.inversionHeightFeet != null
                ? `~${Math.round(sounding.inversionHeightFeet).toLocaleString()} ft (${Math.round(
                    sounding.inversionHeightMeters ?? 0
                  ).toLocaleString()} m)`
                : "No inversion detected in this morning's sounding"}
            </div>
          </div>
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Based on a single real balloon observation at Oakland Airport, projected as a flat
            elevation plane — actual marine layer depth varies by location.
          </p>
        </>
      ) : (
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Forecast data valid</div>
          <div className="font-medium">{formatTimestamp(hrrr?.validTime)}</div>
        </div>
      )}
      <Legend mode={mode} />
    </div>
  );
}
