import { useState } from "react";
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

// null `value` means the label is prose (e.g. "no inversion"), not a figure
// — the caller renders `value` in the data/mono face and `suffix` in the
// normal body face, so only the actual numbers get tabular treatment.
function formatInversionLabel(sounding: SoundingRecord | null): { value: string | null; suffix: string } {
  if (sounding?.inversionHeightFeet != null) {
    return {
      value: `~${Math.round(sounding.inversionHeightFeet).toLocaleString()} ft (${Math.round(
        sounding.inversionHeightMeters ?? 0
      ).toLocaleString()} m)`,
      suffix: "",
    };
  }
  if (sounding?.uncertainCapHeightFeet != null) {
    return {
      value: `~${Math.round(sounding.uncertainCapHeightFeet).toLocaleString()} ft (${Math.round(
        sounding.uncertainCapHeightMeters ?? 0
      ).toLocaleString()} m)`,
      suffix: " — possible cap, not confirmed",
    };
  }
  return { value: null, suffix: "No inversion detected in this morning's sounding" };
}

interface StatusMessageProps {
  status: FetchStatus;
  onRetry: () => void;
  label: string;
}

function StatusMessage({ status, onRetry, label }: StatusMessageProps) {
  if (status === "loading") {
    return <div className="text-sm text-muted">Loading {label}…</div>;
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted">No {label} data yet.</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-surface-border px-2 py-0.5 text-xs font-medium hover:bg-background"
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

  const inversion = formatInversionLabel(sounding);

  return (
    <div className="w-full max-w-sm space-y-3 rounded-lg border border-surface-border bg-surface/95 p-4 shadow-md backdrop-blur">
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
              <div className="text-xs uppercase tracking-wide text-muted">Launch time (KOAK, 12Z)</div>
              <div className="font-data font-medium">{formatTimestamp(sounding?.launchTimeUTC)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Inversion height</div>
              <div className="font-medium">
                {inversion.value ? <span className="font-data">{inversion.value}</span> : null}
                {inversion.suffix}
              </div>
              {sounding?.inversionHeightFeet == null && sounding?.uncertainCapHeightFeet != null && (
                <p className="mt-1 text-xs text-muted">
                  Humidity never reached full saturation in this sounding — this height is a possible cap, not a
                  confirmed marine layer.
                </p>
              )}
              {sounding?.onshoreFlowNearInversion && (
                <p className="mt-1 text-xs text-accent-ink">
                  Onshore flow near the inversion top may be pushing the marine layer higher on windward ridges than
                  this flat-plane estimate shows.
                </p>
              )}
            </div>
            <p className="border-l-2 border-accent/50 py-0.5 pl-2 text-xs text-muted">
              Calculated from the 12Z (5AM PT) weather balloon launch at Oakland Airport, projected as a flat
              elevation plane.
            </p>
            {hasProfile && (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="w-full rounded-md border border-surface-border py-1.5 text-xs font-medium hover:bg-background"
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
          <div className="text-xs uppercase tracking-wide text-muted">Forecast data valid</div>
          <div className="font-data font-medium">{formatTimestamp(hrrr?.validTime)}</div>
        </div>
      )}
      {profileOpen && sounding && (
        <SoundingProfileModal sounding={sounding} trailheads={trailheads} onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
}
