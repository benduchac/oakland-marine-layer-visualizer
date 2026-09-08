"use client";

import { useEffect, useState } from "react";
import MarineLayerMap from "@/components/MarineLayerMap";
import ModeToggle from "@/components/ModeToggle";
import InfoPanel from "@/components/InfoPanel";
import DevSoundingPicker from "@/components/DevSoundingPicker";
import type { ViewMode } from "@/lib/mode";
import type { HrrrProxyRecord, SoundingRecord } from "@/lib/types";

const IS_DEV = process.env.NODE_ENV !== "production";

async function fetchOrNull<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    return body.ok ? (body.data as T) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [mode, setMode] = useState<ViewMode>("sounding");
  const [sounding, setSounding] = useState<SoundingRecord | null>(null);
  const [hrrr, setHrrr] = useState<HrrrProxyRecord | null>(null);
  const [soundingOverride, setSoundingOverride] = useState<SoundingRecord | null>(null);

  useEffect(() => {
    fetchOrNull<SoundingRecord>("/api/sounding").then(setSounding);
    fetchOrNull<HrrrProxyRecord>("/api/hrrr-proxy").then(setHrrr);
  }, []);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const displayedSounding = soundingOverride ?? sounding;

  return (
    <div className="relative flex h-dvh w-full flex-col">
      {mapboxToken ? (
        <MarineLayerMap mapboxToken={mapboxToken} mode={mode} sounding={displayedSounding} hrrr={hrrr} />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-zinc-100 p-8 text-center text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          Set <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">NEXT_PUBLIC_MAPBOX_TOKEN</code> in
          your environment to load the map.
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-3 p-4">
        <div className="pointer-events-auto">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4">
        <div className="pointer-events-auto">
          <InfoPanel mode={mode} sounding={displayedSounding} hrrr={hrrr} isDevOverride={soundingOverride != null} />
        </div>
      </div>

      {IS_DEV && (
        <div className="pointer-events-none absolute bottom-4 right-4">
          <div className="pointer-events-auto">
            <DevSoundingPicker onOverride={setSoundingOverride} isOverridden={soundingOverride != null} />
          </div>
        </div>
      )}
    </div>
  );
}
