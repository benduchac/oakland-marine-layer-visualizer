import type { ViewMode } from "@/lib/mode";

export default function Legend({ mode }: { mode: ViewMode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Map legend</div>
      {mode === "sounding" ? (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(200,60,60,0.55)" }} />
            <span>In the marine layer (terrain below the inversion plane)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(217,119,6,0.4)" }} />
            <span>Possibly in an uncertain cap (humidity never fully saturated)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm border border-zinc-400" />
            <span>Above the marine layer (terrain above the plane)</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: "linear-gradient(90deg, transparent, rgba(120,150,230,0.65), rgba(90,90,200,0.85))" }}
            />
            <span>Sky cover % (NWS gridpoint forecast, sampled across the hills)</span>
          </div>
        </div>
      )}
    </div>
  );
}
