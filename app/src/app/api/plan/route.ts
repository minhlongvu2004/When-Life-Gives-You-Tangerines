import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCachedExplanation, getMetricsRow, saveExplanation } from "@/lib/db";
import { explain, geminiCall, planFacts, sanitizeMode, sanitizeShock, templateExplanation, fillExplanation, type ExplanationResult } from "@/lib/explain";
import { clientIp, rateLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const RULES_VERSION = process.env.RULES_VERSION ?? "v1";
// Bump when buildPrompt() changes, so old wording is never served from the cache.
const PROMPT_VERSION = "p2";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export async function POST(req: Request) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === "number" && Number.isInteger(b.id) && b.id > 0 && b.id < 1e9 ? b.id : null;
  const shock = sanitizeShock(b.shock);
  const mode = sanitizeMode(b.mode);
  if (id === null || !shock || !mode) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    // The server recomputes everything. The browser only says WHICH customer and WHAT shock.
    const metrics = await getMetricsRow(id);
    if (!metrics) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const facts = planFacts(metrics, shock, mode);

    const key = createHash("sha256").update(JSON.stringify([id, shock, mode, RULES_VERSION, PROMPT_VERSION, GEMINI_MODEL])).digest("hex");
    try {
      const cached = await getCachedExplanation(key);
      if (cached) return NextResponse.json({ ...(cached as object), rulesVersion: RULES_VERSION });
    } catch (e) {
      console.error("plan cache read failed", e); // the cache is optional
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const result = await explain(facts, apiKey ? geminiCall({ apiKey, model: GEMINI_MODEL }) : null);
    if (result.rejected) console.warn(`plan: using template (${result.rejected})`);
    const { rejected: _rejected, ...out } = result;
    void _rejected;

    // Only Gemini answers are worth saving. A template should be retried next time.
    if (out.source === "gemini") {
      saveExplanation(key, RULES_VERSION, out).catch((e) => console.error("plan cache write failed", e));
    }
    return NextResponse.json({ ...(out as ExplanationResult), rulesVersion: RULES_VERSION });
  } catch (e) {
    console.error("POST /api/plan failed", e);
    // Even if the database is down the plan must work: answer from the template.
    try {
      const metrics = await getMetricsRow(id).catch(() => null);
      if (metrics) {
        const facts = planFacts(metrics, shock, mode);
        return NextResponse.json({ ...fillExplanation(templateExplanation(facts), facts.slots), source: "template", rulesVersion: RULES_VERSION });
      }
    } catch {
      /* fall through */
    }
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
