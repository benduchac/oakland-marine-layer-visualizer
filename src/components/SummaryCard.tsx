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
    return { label: "…", className: "text-muted" };
  }

  const confirmedFt = sounding?.inversionHeightFeet;
  const uncertainFt = sounding?.uncertainCapHeightFeet;
  const activeFt = confirmedFt ?? uncertainFt;
  const isUncertain = confirmedFt == null && uncertainFt != null;

  if (activeFt == null) {
    return { label: "Clear", className: "text-accent-ink" };
  }
  if (Math.abs(elevationFt - activeFt) <= NEAR_FOG_LINE_MARGIN_FT) {
    return { label: "Near the fog line", className: "text-uncertain-ink" };
  }
  if (elevationFt > activeFt) {
    return {
      label: isUncertain ? "Likely above the fog" : "Above the fog",
      className: "text-accent-ink",
    };
  }
  return {
    label: isUncertain ? "Likely in the fog" : "In the fog",
    className: "text-layer-ink",
  };
}

interface SummaryCardProps {
  trailheads: TrailheadElevation[];
  sounding: SoundingRecord | null;
}

export default function SummaryCard({ trailheads, sounding }: SummaryCardProps) {
  if (trailheads.length === 0) return null;

  return (
    <div className="w-72 max-w-[calc(100vw-2rem)] space-y-1.5 rounded-lg border border-surface-border bg-surface/95 p-3 text-sm shadow-md backdrop-blur">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">What to expect</div>
      {/* Grid, not flex+justify-between: columns size to their own content
          (longest name, longest status), so the gap between a name and its
          status is a fixed ~12px regardless of card width, instead of
          stretching across the full row. `li.contents` keeps <li> semantics
          without it becoming its own grid item. */}
      <ul className="grid grid-cols-[auto_auto] items-start gap-x-3 gap-y-1.5">
        {trailheads.map((t) => {
          const status = statusFor(t.elevationFt, sounding);
          return (
            <li key={t.name} className="contents">
              <div>
                <div className="text-sm font-medium">{t.name}</div>
                {t.elevationFt != null && (
                  <div className="font-data text-xs text-muted">{Math.round(t.elevationFt).toLocaleString()} ft</div>
                )}
              </div>
              <span className={`justify-self-end font-medium whitespace-nowrap ${status.className}`}>
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
