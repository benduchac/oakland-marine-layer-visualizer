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
    // Expected, not exceptional: the archive just hasn't posted today's KOAK
    // launch yet. Leaves any existing stored record untouched so retry
    // logic (fetch-sounding-cron.sh, the GH Actions sweep) sees an honest
    // failure to retry against, instead of a same-day-looking success.
    return NextResponse.json(
      { ok: false, error: "Today's KOAK launch hasn't posted to the archive yet" },
      { status: 502 }
    );
  }

  const record = buildSoundingRecord(KOAK_STATION_ID, result);

  await writeJSON("sounding/latest.json", record);
  return NextResponse.json({ ok: true, data: record });
}
