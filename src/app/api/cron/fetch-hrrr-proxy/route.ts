import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { buildSampleGrid } from "@/lib/geo";
import { sampleGridPoints } from "@/lib/nws";
import { writeJSON } from "@/lib/storage";
import type { HrrrProxyRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

// 5x5 to start per spec §8 — coarse, given NWS API rate considerations.
const GRID_SIZE = 5;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const points = buildSampleGrid(GRID_SIZE);
  const samples = await sampleGridPoints(points);

  const record: HrrrProxyRecord = {
    validTime: new Date().toISOString(),
    samples,
    fetchedAt: new Date().toISOString(),
  };

  await writeJSON("hrrr-proxy/latest.json", record);
  return NextResponse.json({ ok: true, data: record });
}
