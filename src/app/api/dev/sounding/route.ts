import { NextResponse } from "next/server";
import { readCachedSounding, writeCachedSounding } from "@/lib/devSoundingCache";
import { KOAK_STATION_ID } from "@/lib/geo";
import { buildSoundingRecord, fetchSoundingForLaunch } from "@/lib/sounding";
import type { SoundingRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

// Lets a developer preview how Mode B looks for a specific historical
// launch (e.g. a real marine-layer morning) instead of whatever today's
// sounding happens to be. Dev-only: never available in a production build,
// and never writes to the real storage backend — this is preview-only,
// separate from the cron-fetched "latest" record real users see.
//
// Backed by a local dev cache (see lib/devSoundingCache.ts): the live
// Wyoming archive fetch alone can take 10-15s, so once a date has been
// loaded once (here or via /api/dev/seed-soundings) it comes back
// instantly on every later load.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const hourParam = searchParams.get("hour") ?? "12";

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ ok: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const hourUTC = hourParam === "0" ? 0 : 12;

  const cached = await readCachedSounding<SoundingRecord>(dateParam, hourUTC);
  if (cached) {
    return NextResponse.json({ ok: true, data: cached, cached: true });
  }

  const launchDate = new Date(`${dateParam}T00:00:00Z`);
  if (Number.isNaN(launchDate.getTime())) {
    return NextResponse.json({ ok: false, error: "invalid date" }, { status: 400 });
  }

  const result = await fetchSoundingForLaunch(launchDate, hourUTC);
  if (!result) {
    return NextResponse.json({ ok: false, error: "No sounding data for that launch" }, { status: 404 });
  }

  const record = buildSoundingRecord(KOAK_STATION_ID, result);
  await writeCachedSounding(dateParam, hourUTC, record);

  return NextResponse.json({ ok: true, data: record, cached: false });
}
