import { NextResponse } from "next/server";
import { readCachedSounding, writeCachedSounding } from "@/lib/devSoundingCache";
import { DEV_SOUNDING_PRESETS } from "@/lib/devSoundingPresets";
import { KOAK_STATION_ID } from "@/lib/geo";
import { buildSoundingRecord, fetchSoundingForLaunch } from "@/lib/sounding";
import type { SoundingRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

// Pre-warms the local dev sounding cache for every DEV_SOUNDING_PRESETS
// entry, so switching between them in the picker is instant instead of
// re-hitting the (slow, 10-15s) live Wyoming archive on every load.
// Dev-only, same as /api/dev/sounding. Skips dates already cached; pass
// ?force=1 to refetch everything.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const results: { date: string; hour: string; status: "cached" | "fetched" | "error"; error?: string }[] = [];

  for (const preset of DEV_SOUNDING_PRESETS) {
    const hourUTC = preset.hour === "0" ? 0 : 12;

    if (!force) {
      const cached = await readCachedSounding<SoundingRecord>(preset.date, hourUTC);
      if (cached) {
        results.push({ date: preset.date, hour: preset.hour, status: "cached" });
        continue;
      }
    }

    try {
      const launchDate = new Date(`${preset.date}T00:00:00Z`);
      const result = await fetchSoundingForLaunch(launchDate, hourUTC);
      if (!result) {
        results.push({ date: preset.date, hour: preset.hour, status: "error", error: "no data returned" });
        continue;
      }
      const record = buildSoundingRecord(KOAK_STATION_ID, result);
      await writeCachedSounding(preset.date, hourUTC, record);
      results.push({ date: preset.date, hour: preset.hour, status: "fetched" });
    } catch (err) {
      results.push({
        date: preset.date,
        hour: preset.hour,
        status: "error",
        error: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
