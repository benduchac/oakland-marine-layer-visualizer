"use client";

import { useEffect, useState } from "react";
import MarineLayerMap from "@/components/MarineLayerMap";
import ModeToggle from "@/components/ModeToggle";
import InfoPanel from "@/components/InfoPanel";
import type { ViewMode } from "@/lib/mode";
import type { HrrrProxyRecord, SoundingRecord } from "@/lib/types";

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

  useEffect(() => {
    fetchOrNull<SoundingRecord>("/api/sounding").then(setSounding);
    fetchOrNull<HrrrProxyRecord>("/api/hrrr-proxy").then(setHrrr);
  }, []);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  return (
    <div className="relative flex h-dvh w-full flex-col">
      {mapboxToken ? (
        <MarineLayerMap mapboxToken={mapboxToken} mode={mode} sounding={sounding} hrrr={hrrr} />
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
          <InfoPanel mode={mode} sounding={sounding} hrrr={hrrr} />
        </div>
      </div>
    </div>
  );
}
