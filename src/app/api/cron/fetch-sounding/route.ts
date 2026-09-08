import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { KOAK_STATION_ID } from "@/lib/geo";
import { fetchLatestSounding } from "@/lib/sounding";
import { writeJSON } from "@/lib/storage";
import type { SoundingRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const METERS_TO_FEET = 3.28084;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await fetchLatestSounding();
  if (!result) {
    return NextResponse.json({ ok: false, error: "No sounding data available" }, { status: 502 });
  }

  const record: SoundingRecord = {
    stationId: KOAK_STATION_ID,
    launchTimeUTC: result.launchTimeUTC,
    inversionHeightMeters: result.inversionHeightMeters,
    inversionHeightFeet:
      result.inversionHeightMeters != null ? result.inversionHeightMeters * METERS_TO_FEET : null,
    fetchedAt: new Date().toISOString(),
  };

  await writeJSON("sounding/latest.json", record);
  return NextResponse.json({ ok: true, data: record });
}
