"use client";

import { useEffect, useState } from "react";
import MarineLayerMap from "@/components/MarineLayerMap";
import ModeToggle from "@/components/ModeToggle";
import InfoPanel from "@/components/InfoPanel";
import DevSoundingPicker from "@/components/DevSoundingPicker";
import SummaryCard from "@/components/SummaryCard";
import type { FetchStatus, ViewMode } from "@/lib/mode";
import type { HrrrProxyRecord, SoundingRecord, TrailheadElevation } from "@/lib/types";

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
  const [soundingStatus, setSoundingStatus] = useState<FetchStatus>("loading");
  const [hrrrStatus, setHrrrStatus] = useState<FetchStatus>("loading");
  const [trailheadElevations, setTrailheadElevations] = useState<TrailheadElevation[]>([]);

  useEffect(() => {
    fetchOrNull<SoundingRecord>("/api/sounding").then((data) => {
      setSounding(data);
      setSoundingStatus(data ? "ready" : "empty");
    });
    fetchOrNull<HrrrProxyRecord>("/api/hrrr-proxy").then((data) => {
      setHrrr(data);
      setHrrrStatus(data ? "ready" : "empty");
    });
  }, []);

  // "empty" means no stored data yet (e.g. cron hasn't run in this
  // environment) — retrying hits the cron route directly to fetch + store
  // fresh data, then updates from its response.
  async function retrySounding() {
    setSoundingStatus("loading");
    const data = await fetchOrNull<SoundingRecord>("/api/cron/fetch-sounding");
    setSounding(data);
    setSoundingStatus(data ? "ready" : "empty");
  }

  async function retryHrrr() {
    setHrrrStatus("loading");
    const data = await fetchOrNull<HrrrProxyRecord>("/api/cron/fetch-hrrr-proxy");
    setHrrr(data);
    setHrrrStatus(data ? "ready" : "empty");
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const displayedSounding = soundingOverride ?? sounding;
  const displayedSoundingStatus = soundingOverride ? "ready" : soundingStatus;

  return (
    <div className="relative flex h-dvh w-full flex-col">
      {mapboxToken ? (
        <MarineLayerMap
          mapboxToken={mapboxToken}
          mode={mode}
          sounding={displayedSounding}
          hrrr={hrrr}
          onTrailheadElevations={setTrailheadElevations}
        />
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

      <div className="pointer-events-none absolute top-4 left-4">
        <div className="pointer-events-auto">
          <SummaryCard trailheads={trailheadElevations} sounding={displayedSounding} />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4">
        <div className="pointer-events-auto">
          <InfoPanel
            mode={mode}
            sounding={displayedSounding}
            hrrr={hrrr}
            isDevOverride={soundingOverride != null}
            soundingStatus={displayedSoundingStatus}
            hrrrStatus={hrrrStatus}
            onRetrySounding={retrySounding}
            onRetryHrrr={retryHrrr}
          />
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
