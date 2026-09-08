"use client";

import { useState } from "react";
import type { SoundingRecord } from "@/lib/types";

const PRESETS = [
  { label: "8/25/2026 · reference marine layer (~1,730 ft)", date: "2026-08-25", hour: "12" },
];

interface DevSoundingPickerProps {
  onOverride: (record: SoundingRecord | null) => void;
  isOverridden: boolean;
}

export default function DevSoundingPicker({ onOverride, isOverridden }: DevSoundingPickerProps) {
  const [date, setDate] = useState(PRESETS[0].date);
  const [hour, setHour] = useState(PRESETS[0].hour);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function load(loadDate: string, loadHour: string) {
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch(`/api/dev/sounding?date=${loadDate}&hour=${loadHour}`);
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? "Failed to load sounding");
      onOverride(body.data as SoundingRecord);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to load sounding");
    }
  }

  return (
    <div className="w-full max-w-xs space-y-2 rounded-lg border border-dashed border-amber-400 bg-amber-50/95 p-3 text-xs shadow-md backdrop-blur dark:border-amber-600 dark:bg-amber-950/90">
      <div className="font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Dev: load a specific sounding
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-amber-300 bg-white px-1.5 py-1 dark:border-amber-700 dark:bg-zinc-900"
        />
        <select
          value={hour}
          onChange={(e) => setHour(e.target.value)}
          className="rounded border border-amber-300 bg-white px-1.5 py-1 dark:border-amber-700 dark:bg-zinc-900"
        >
          <option value="12">12Z (~5am)</option>
          <option value="0">00Z (~5pm)</option>
        </select>
        <button
          type="button"
          onClick={() => load(date, hour)}
          disabled={status === "loading"}
          className="rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {status === "loading" ? "Loading…" : "Load"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={`${preset.date}-${preset.hour}`}
            type="button"
            onClick={() => {
              setDate(preset.date);
              setHour(preset.hour);
              load(preset.date, preset.hour);
            }}
            className="rounded border border-amber-300 px-1.5 py-0.5 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
          >
            {preset.label}
          </button>
        ))}
        {isOverridden && (
          <button
            type="button"
            onClick={() => onOverride(null)}
            className="rounded border border-amber-400 px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900"
          >
            Back to live data
          </button>
        )}
      </div>

      {status === "error" && <div className="text-red-700 dark:text-red-400">{errorMessage}</div>}
    </div>
  );
}
