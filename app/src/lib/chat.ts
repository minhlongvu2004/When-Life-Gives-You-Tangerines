// Free-text "Ask about this plan". Gemini sees everything on the page, with each number behind a slot,
// and writes with slot tokens only. A reply is accepted only if it has no digit and uses only known slots.
// (The five preset questions live in ask.ts and never need a model.)

import { AVG_SEARCH_DATE, AVG_SEARCH_WEEKS, eiWeeksFullTime, SOURCES, toSegments, type Segment } from "./ask";
import { money, scenario, type Metrics, type Mode, type Shock } from "./engine";
import type { ModelCall } from "./gemini";
import { compact, planCards, type PlanCard } from "./planCards";

type SourceId = keyof typeof SOURCES;
const TOKEN = /\{(\w+)\}/g;
const tokensOf = (s: string) => [...s.matchAll(TOKEN)].map((x) => x[1]);
const months1 = (r: number | null | undefined) => (r === null ? "120+" : (r ?? 0).toFixed(1));

export interface PageFacts {
  slots: Record<string, string>;
  table: string; // "{slot} = value  (meaning)" lines
  page: string; // what the screen shows, written with slot tokens
}

export function pageFacts(m: Metrics, shock: Shock, mode: Mode): PageFacts {
  const c = planCards(m, shock, mode);
  const sc = scenario(m, shock, mode);
  const g = c.facts.fund;
  const dur = shock.durationMonths;
  const short = (r: number | null | undefined) => (r == null ? "0.0" : Math.max(0, dur - r).toFixed(1));
  const rows: [string, string, string][] = [
    ["customer_id", String(m.id), "account number"],
    ["region", m.region, "customer's region"],
    ["unemp", `${m.unemp.toFixed(1)}%`, "regional unemployment rate (2023)"],
    ["income_usual", money(m.I), "usual monthly income (median)"],
    ["spending_usual", money(m.S), "usual monthly spending (median)"],
    ["fixed_costs", money(m.F), "usual monthly fixed costs: bills + insurance + loan"],
    ["savings", money(m.B), "savings buffer (average balance, last 6 months)"],
    ["flex_spending", money(m.disc), "usual monthly flexible spending (card, cash, other transfers)"],
    ["lean_month", money(m.lean), "their leanest-month flexible spending (25th percentile)"],
    ["loan_payment", money(m.P), "monthly payment of a running loan (zero if none)"],
    ["shock_income", money(c.income), "monthly income during the shock"],
    ["shock_spending", money(sc.spending), "monthly spending during the shock"],
    ["monthly_gap", money(Math.max(sc.gap, 0)), "spending minus income during the shock"],
    ["duration", String(dur), "months the shock lasts (the target to survive)"],
    ["one_off", money(c.oneOff), "one-off cost at the start of the shock (zero if none)"],
    ["runway_nothing", months1(c.nothing.runway), "months savings last if they do nothing"],
    ["runway_short", months1(c.short.runway), "months savings last with the short-term plan"],
    ["runway_long", c.long.runway === undefined ? "n/a" : months1(c.long.runway), "months savings last with the long-term plan (n/a if blocked)"],
    ["short_nothing", short(c.nothing.runway), "months short of the duration, do nothing"],
    ["short_short", short(c.short.runway), "months short of the duration, short-term plan"],
    ["short_long", short(c.long.runway), "months short of the duration, long-term plan"],
    ["cut_target", money(m.disc * (1 - c.facts.leanCut)), "flexible spending the short-term plan allows per month"],
    ["cut_pct", `${Math.round(c.facts.leanCut * 100)}%`, "share of flexible spending cut (lean-month rule, kept between 10% and 50%)"],
    ["fund_target", compact(g.target), "emergency fund target"],
    ["save_monthly", money(c.facts.save), "monthly auto-save of the long-term plan"],
    ["fund_months", String(c.facts.whenMonths ?? ""), "months to reach the fund target"],
    ["search_weeks", String(AVG_SEARCH_WEEKS), `average job search in Canada, weeks (Statistics Canada, ${AVG_SEARCH_DATE})`],
    ["ei_weeks", String(eiWeeksFullTime(m.unemp)), "weeks of EI for a full-time worker in their region (EI Act Schedule I)"],
    ["ei_pct", `${Math.round(shock.incomePct * 100)}%`, "share of usual income the shock leaves"],
  ];
  const slots = Object.fromEntries(rows.map(([k, v]) => [k, v]));
  const table = rows.map(([k, v, why]) => `{${k}} = ${v}  (${why})`).join("\n");

  const cardLine = (name: string, card: PlanCard, run: string, shortSlot: string) =>
    `- ${name}: ${card.timing}${card.timingNote ? " · " + card.timingNote : ""}. ` +
    (card.actions.length
      ? "Actions: " + card.actions.map((a) => a.text.replace("{amount}", a.amount ?? "")).join("; ")
      : `No actions (${card.empty}).`) +
    " Result: " +
    (card.runway === undefined
      ? "can't save yet."
      : `savings last {${run}} months` + (card.pill ? ` (${card.pill.replace(/[\d.]+/, `{${shortSlot}}`)})` : "") + ".");
  const page = [
    shock.jobLoss
      ? `The shock: job loss. Income ${shock.incomePct === 0 ? "drops to zero (no EI)" : "becomes {shock_income} a month (EI at {ei_pct} of usual income)"} for {duration} months.`
      : `The shock: ${shockSummary(shock)}, lasting {duration} months.`,
    `Mode: ${mode === "judge" ? "judges' formula (EI = share of income, no cap)" : "realistic (EI capped at the real weekly maximum, pension keeps paying)"}.`,
    "The three cards answer one question: if the shock hits, how long does their money last (runway = savings ÷ (spending − income)).",
    cardLine("Do nothing", c.nothing, "runway_nothing", "short_nothing"),
    cardLine("Short term", c.short, "runway_short", "short_short"),
    cardLine("Long term (build the emergency fund first, then the shock hits)", c.long, "runway_long", "short_long"),
    "Short-term cut rule: go back to the customer's own lean month of flexible spending, never less than a 10% cut and never more than 50%. The loan payment is paused if a loan is running.",
    "Emergency fund rule: the larger of 6 months of the monthly gap on EI, 3 months of fixed costs, and one month of spending. Half of the monthly surplus is saved (plus a 10% trim of flexible spending when that is faster).",
    "Reference: a typical EI claim lasts 14 to 45 weeks depending on the region's unemployment rate. Sources you may cite: ei (canada.ca EI benefits), schedule (EI Act Schedule I), fund (CIRO emergency fund), statcan (average weeks unemployed).",
  ].join("\n");
  return { slots, table, page };
}

function shockSummary(s: Shock): string {
  const parts: string[] = [];
  if (s.incomePct !== 1) parts.push("income reduced");
  if (s.billsPct) parts.push(s.billsPct > 0 ? "household bills up" : "household bills down");
  if (s.extraMonthly) parts.push("an extra monthly cost");
  if (s.oneOffMult || s.oneOffAbs) parts.push("a one-off cost");
  return parts.join(" and ") || "no change";
}

export type ChatTurn = { role: "me" | "bot"; text: string };

export function buildChatPrompt(f: PageFacts, text: string, history: ChatTurn[]): string {
  return [
    "You are the assistant inside a personal-finance app. The person is looking at the 'Plan' screen for one bank customer. Answer their question using only what is on that screen, in warm plain English, in 2 to 4 short sentences.",
    "",
    "RULES",
    "1. Never write any digit (0-9), and never spell a number out as a figure. Whenever you mention a quantity from the table, write its slot token exactly, with braces, for example {runway_short}. The app replaces tokens with the engine's numbers.",
    "2. Use only the slot tokens in the table. Never invent a token or a number. If the answer needs a number that is not in the table, describe it in words (a bit more than, about double) or say you don't have it.",
    "3. Do not invent facts, products, rates or promises. Explain how the numbers on the screen were worked out, why a step is there, what the cards mean, and where numbers and sources come from.",
    "4. Talk about the customer in the third person (they, their), not 'you'. Cite a source id only if your answer directly relies on it, usually zero or one. Stay on this customer's plan and the finance ideas on the screen. If asked something else, say briefly that you can only help with this plan and suggest a question you can answer. Give no personalised investment advice.",
    '5. Return JSON: {"text": your answer (at most 600 characters), "sources": ids from [ei, schedule, fund, statcan] that support the answer, or an empty array}.',
    "",
    "WHAT THE SCREEN SHOWS",
    f.page,
    "",
    "SLOT TABLE (token = value shown to the user, meaning). You may read the values to reason, but you must write the token, not the value:",
    f.table,
    "",
    "CONVERSATION SO FAR",
    history.length ? history.map((t) => `${t.role === "me" ? "User" : "Assistant"}: ${t.text}`).join("\n") : "(none)",
    "",
    `User question: ${text}`,
  ].join("\n");
}

export const CHAT_SCHEMA = {
  type: "OBJECT",
  properties: { text: { type: "STRING" }, sources: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["text"],
};

const MAX_CHAT_REPLY = 800;

export function checkChat(
  reply: unknown,
  slots: Record<string, string>,
): { ok: true; text: string; sources: SourceId[] } | { ok: false; reason: string } {
  if (!reply || typeof reply !== "object" || typeof (reply as { text?: unknown }).text !== "string") return { ok: false, reason: "shape" };
  const r = reply as { text: string; sources?: unknown };
  const text = r.text.trim();
  if (!text || text.length > MAX_CHAT_REPLY) return { ok: false, reason: "length" };
  if (/\d/.test(text)) return { ok: false, reason: "digit" };
  if (tokensOf(text).some((k) => !(k in slots))) return { ok: false, reason: "unknown slot" };
  if (/[{}]/.test(text.replace(TOKEN, ""))) return { ok: false, reason: "stray brace" };
  const sources = Array.isArray(r.sources) ? [...new Set(r.sources.filter((s): s is SourceId => typeof s === "string" && s in SOURCES))] : [];
  return { ok: true, text, sources };
}

export interface ChatAnswer {
  segments: Segment[];
  sources: { label: string; url: string }[];
  source: "gemini";
}

/** Free-text question. Returns null when there is no model or the reply fails the checks, so the caller can say so honestly. */
export async function chat(
  text: string,
  history: ChatTurn[],
  m: Metrics,
  shock: Shock,
  mode: Mode,
  call: ModelCall | null,
): Promise<ChatAnswer | null> {
  if (!call) return null;
  const f = pageFacts(m, shock, mode);
  try {
    const checked = checkChat(await call(buildChatPrompt(f, text, history)), f.slots);
    if (!checked.ok) return null;
    return { segments: toSegments(checked.text, f.slots), sources: checked.sources.map((s) => SOURCES[s]), source: "gemini" };
  } catch {
    return null;
  }
}
