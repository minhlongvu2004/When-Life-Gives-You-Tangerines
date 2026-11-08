import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { answer, ASK_SCHEMA, sanitizeMode, sanitizeQuestion, sanitizeShock, type Answer } from "@/lib/ask";
import { chat, CHAT_SCHEMA, type ChatTurn } from "@/lib/chat";
import { getCachedExplanation, getMetricsRow, getMetricsRowFromFile, saveExplanation } from "@/lib/db";
import { geminiJson } from "@/lib/gemini";
import { clientIp, rateLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const RULES_VERSION = process.env.RULES_VERSION ?? "v1";
// Bump when buildAskPrompt() or a template changes, so old wording is never served from the cache.
const ASK_PROMPT_VERSION = "a1";
const MAX_TEXT = 300;
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
  const q = sanitizeQuestion(b.q);
  const typed = typeof b.text === "string" ? b.text.trim().slice(0, MAX_TEXT) : "";
  if (id === null || !shock || !mode || (!q && !typed)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // The server recomputes everything. The browser only says WHICH customer, WHAT shock and WHICH question.
  let metrics = null;
  let dbUp = true;
  try {
    metrics = await getMetricsRow(id);
  } catch (e) {
    console.error("ask: database unavailable, using the bundled file", e);
    dbUp = false;
    try {
      metrics = await getMetricsRowFromFile(id);
    } catch (e2) {
      console.error("ask: bundled metrics unreadable", e2);
      return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    }
  }
  if (!metrics) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiKey = process.env.GEMINI_API_KEY;

  // A typed question: Gemini reads the whole page (numbers behind slots) and answers freely. Not cached.
  if (typed) {
    const reply = await chat(typed, sanitizeHistory(b.history), metrics, shock, mode, apiKey ? geminiJson({ apiKey, model: GEMINI_MODEL, schema: CHAT_SCHEMA }) : null);
    return NextResponse.json(
      reply ?? {
        segments: [{ text: "I couldn't answer that just now. Try asking again, or tap one of the suggested questions." }],
        sources: [],
        source: "unavailable",
      },
    );
  }
  if (!q) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // Database down: answer from the template only (no Gemini, no cache).
  if (!dbUp) return NextResponse.json(strip(await answer(q, metrics, shock, mode, null)));

  const key = createHash("sha256").update(JSON.stringify(["ask", id, shock, mode, q, RULES_VERSION, ASK_PROMPT_VERSION, GEMINI_MODEL])).digest("hex");
  try {
    const cached = await getCachedExplanation(key);
    if (cached) return NextResponse.json(cached);
  } catch (e) {
    console.error("ask cache read failed", e); // the cache is optional
  }

  const result = await answer(q, metrics, shock, mode, apiKey ? geminiJson({ apiKey, model: GEMINI_MODEL, schema: ASK_SCHEMA }) : null);
  if (result.rejected) console.warn(`ask: using template (${result.rejected})`);
  const out = strip(result);
  // Only Gemini answers are worth saving. A template should be retried next time.
  if (out.source === "gemini") saveExplanation(key, RULES_VERSION, out).catch((e) => console.error("ask cache write failed", e));
  return NextResponse.json(out);
}

function strip(a: Answer) {
  return { segments: a.segments, sources: a.sources, source: a.source };
}

/** Last few turns of the conversation, trimmed. Anything malformed is dropped. */
function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-6)
    .filter((t): t is ChatTurn => !!t && (t.role === "me" || t.role === "bot") && typeof t.text === "string")
    .map((t) => ({ role: t.role, text: t.text.slice(0, 600) }));
}
