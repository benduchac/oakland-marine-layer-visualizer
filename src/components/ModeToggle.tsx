"use client";

import type { ViewMode } from "@/lib/mode";

interface ModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-full border border-surface-border bg-surface p-1 text-sm shadow-sm">
      <button
        type="button"
        onClick={() => onChange("hrrr")}
        aria-pressed={mode === "hrrr"}
        title="Forecast (HRRR grid)"
        className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
          mode === "hrrr" ? "bg-accent text-white" : "text-muted hover:bg-background"
        }`}
      >
        Forecast
      </button>
      <button
        type="button"
        onClick={() => onChange("sounding")}
        aria-pressed={mode === "sounding"}
        title="This morning's real sounding (flat plane)"
        className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
          mode === "sounding" ? "bg-accent text-white" : "text-muted hover:bg-background"
        }`}
      >
        Sounding
      </button>
    </div>
  );
}
