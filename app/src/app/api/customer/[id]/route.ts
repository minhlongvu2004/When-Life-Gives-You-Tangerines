import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  // Account ids are positive integers. Reject anything else before it reaches SQL.
  if (!/^\d{1,9}$/.test(raw)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    const body = await getCustomer(Number(raw));
    if (!body) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch (e) {
    console.error("GET /api/customer failed", e);
    return NextResponse.json({ error: "Data unavailable" }, { status: 503 });
  }
}
