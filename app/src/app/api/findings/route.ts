import { NextResponse } from "next/server";
import { getFindings } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body = await getFindings();
    if (!body) return NextResponse.json({ error: "Findings not loaded" }, { status: 404 });
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch (e) {
    console.error("GET /api/findings failed", e);
    return NextResponse.json({ error: "Data unavailable" }, { status: 503 });
  }
}
