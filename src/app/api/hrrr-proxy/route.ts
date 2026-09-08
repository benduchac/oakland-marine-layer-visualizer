import { NextResponse } from "next/server";
import { readJSON } from "@/lib/storage";
import type { HrrrProxyRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readJSON<HrrrProxyRecord>("hrrr-proxy/latest.json");
  if (!data) {
    return NextResponse.json({ ok: false, error: "No HRRR proxy data stored yet" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data });
}
