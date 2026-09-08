"use client";

import type { ViewMode } from "@/lib/mode";

interface ModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-full border border-zinc-300 bg-white p-1 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => onChange("hrrr")}
        aria-pressed={mode === "hrrr"}
        className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
          mode === "hrrr"
            ? "bg-blue-600 text-white"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }`}
      >
        Forecast (HRRR grid)
      </button>
      <button
        type="button"
        onClick={() => onChange("sounding")}
        aria-pressed={mode === "sounding"}
        className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
          mode === "sounding"
            ? "bg-blue-600 text-white"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }`}
      >
        This morning&apos;s real sounding (flat plane)
      </button>
    </div>
  );
}
