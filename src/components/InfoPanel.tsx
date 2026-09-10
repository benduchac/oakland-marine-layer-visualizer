import { useState } from "react";
import Legend from "./Legend";
import SoundingProfileModal from "./SoundingProfileModal";
import type { FetchStatus, ViewMode } from "@/lib/mode";
import type { HrrrProxyRecord, SoundingRecord, TrailheadElevation } from "@/lib/types";

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatInversionLabel(sounding: SoundingRecord | null): string {
  if (sounding?.inversionHeightFeet != null) {
    return `~${Math.round(sounding.inversionHeightFeet).toLocaleString()} ft (${Math.round(
      sounding.inversionHeightMeters ?? 0
    ).toLocaleString()} m)`;
  }
  if (sounding?.uncertainCapHeightFeet != null) {
    return `Uncertain cap possible at ~${Math.round(sounding.uncertainCapHeightFeet).toLocaleString()} ft (${Math.round(
      sounding.uncertainCapHeightMeters ?? 0
    ).toLocaleString()} m)`;
  }
  return "No inversion detected in this morning's sounding";
}

interface StatusMessageProps {
  status: FetchStatus;
  onRetry: () => void;
  label: string;
}

function StatusMessage({ status, onRetry, label }: StatusMessageProps) {
  if (status === "loading") {
    return <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading {label}…</div>;
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">No {label} data yet.</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
      >
        Click to fetch
      </button>
    </div>
  );
}

interface InfoPanelProps {
  mode: ViewMode;
  sounding: SoundingRecord | null;
  hrrr: HrrrProxyRecord | null;
  trailheads: TrailheadElevation[];
  isDevOverride?: boolean;
  soundingStatus: FetchStatus;
  hrrrStatus: FetchStatus;
  onRetrySounding: () => void;
  onRetryHrrr: () => void;
}

export default function InfoPanel({
  mode,
  sounding,
  hrrr,
  trailheads,
  isDevOverride,
  soundingStatus,
  hrrrStatus,
  onRetrySounding,
  onRetryHrrr,
}: InfoPanelProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const hasProfile = (sounding?.profile?.length ?? 0) > 0;

  return (
    <div className="w-full max-w-sm space-y-3 rounded-lg border border-zinc-200 bg-white/95 p-4 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      {mode === "sounding" ? (
        soundingStatus !== "ready" ? (
          <StatusMessage status={soundingStatus} onRetry={onRetrySounding} label="sounding" />
        ) : (
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
              <div className="font-medium">{formatInversionLabel(sounding)}</div>
              {sounding?.inversionHeightFeet == null && sounding?.uncertainCapHeightFeet != null && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Humidity never reached full saturation in this sounding — this height is a possible cap, not a
                  confirmed marine layer.
                </p>
              )}
            </div>
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Based on a single real balloon observation at Oakland Airport, projected as a flat
              elevation plane — actual marine layer depth varies by location.
            </p>
            {hasProfile && (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="w-full rounded-md border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                View sounding detail
              </button>
            )}
          </>
        )
      ) : hrrrStatus !== "ready" ? (
        <StatusMessage status={hrrrStatus} onRetry={onRetryHrrr} label="forecast" />
      ) : (
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Forecast data valid</div>
          <div className="font-medium">{formatTimestamp(hrrr?.validTime)}</div>
        </div>
      )}
      <Legend mode={mode} />
      {profileOpen && sounding && (
        <SoundingProfileModal sounding={sounding} trailheads={trailheads} onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
}
