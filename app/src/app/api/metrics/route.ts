import { NextResponse } from "next/server";
import { getMetrics } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getMetrics(), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  } catch (e) {
    console.error("GET /api/metrics failed", e);
    return NextResponse.json({ error: "Data unavailable" }, { status: 503 });
  }
}
