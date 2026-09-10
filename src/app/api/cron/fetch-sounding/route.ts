import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { KOAK_STATION_ID } from "@/lib/geo";
import { buildSoundingRecord, fetchLatestSounding } from "@/lib/sounding";
import { writeJSON } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await fetchLatestSounding();
  if (!result) {
    return NextResponse.json({ ok: false, error: "No sounding data available" }, { status: 502 });
  }

  const record = buildSoundingRecord(KOAK_STATION_ID, result);

  await writeJSON("sounding/latest.json", record);
  return NextResponse.json({ ok: true, data: record });
}
