import { NextResponse } from "next/server";
import { readJSON } from "@/lib/storage";
import type { SoundingRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readJSON<SoundingRecord>("sounding/latest.json");
  if (!data) {
    return NextResponse.json({ ok: false, error: "No sounding data stored yet" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data });
}
