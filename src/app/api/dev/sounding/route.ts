import { NextResponse } from "next/server";
import { KOAK_STATION_ID } from "@/lib/geo";
import { fetchSoundingForLaunch } from "@/lib/sounding";
import type { SoundingRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const METERS_TO_FEET = 3.28084;

// Lets a developer preview how Mode B looks for a specific historical
// launch (e.g. a real marine-layer morning) instead of whatever today's
// sounding happens to be. Dev-only: never available in a production build,
// and never writes to storage — this is preview-only, separate from the
// cron-fetched "latest" record real users see.
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

  const launchDate = new Date(`${dateParam}T00:00:00Z`);
  if (Number.isNaN(launchDate.getTime())) {
    return NextResponse.json({ ok: false, error: "invalid date" }, { status: 400 });
  }

  const result = await fetchSoundingForLaunch(launchDate, hourUTC);
  if (!result) {
    return NextResponse.json({ ok: false, error: "No sounding data for that launch" }, { status: 404 });
  }

  const record: SoundingRecord = {
    stationId: KOAK_STATION_ID,
    launchTimeUTC: result.launchTimeUTC,
    inversionHeightMeters: result.inversionHeightMeters,
    inversionHeightFeet:
      result.inversionHeightMeters != null ? result.inversionHeightMeters * METERS_TO_FEET : null,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json({ ok: true, data: record });
}
