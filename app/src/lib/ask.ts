// "Ask about this plan": five preset questions. Each answer is a template with {slot} tokens whose numbers
// all come from the rules engine. Gemini may reword the template, but the reply is accepted only if it has
// no digit, uses only this answer's slots and keeps every slot the template used. Otherwise the template stands.

import { money, scenario, type Metrics, type Mode, type Shock } from "./engine";
import type { ModelCall } from "./gemini";
import { compact, LEAN_CUT_MAX, planCards } from "./planCards";

export type QuestionId = "last" | "layoff" | "why6" | "cut" | "saving";

export const QUESTIONS: { id: QuestionId; chip: (durationMonths: number) => string }[] = [
  { id: "last", chip: () => "How long does their money last?" },
  { id: "layoff", chip: () => "How long could the layoff last?" },
  { id: "why6", chip: (d) => `Why ${d} months?` },
  { id: "cut", chip: () => "Why this spending cut?" },
  { id: "saving", chip: () => "How is the monthly saving worked out?" },
];

export const SOURCES = {
  ei: { label: "canada.ca: EI regular benefits", url: "https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html" },
  schedule: { label: "EI Act, Schedule I (weeks of benefits)", url: "https://laws.justice.gc.ca/eng/acts/E-5.6/section-sched218784-20210926.html" },
  fund: { label: "CIRO: What is an emergency fund", url: "https://www.ciro.ca/node/28996" },
  statcan: { label: "Statistics Canada, Table 14-10-0342-01", url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1410034201" },
} as const;
type SourceId = keyof typeof SOURCES;

/** StatCan Table 14-10-0342-01: average weeks unemployed, Canada, 15+, seasonally adjusted. */
export const AVG_SEARCH_WEEKS = 22.8;
export const AVG_SEARCH_DATE = "October 2026";
const EI_WEEKS_MIN = 14;
const EI_WEEKS_MAX = 45;

/** EI Act Schedule I, full-time row (1,820+ insured hours), by the region's unemployment rate. */
export function eiWeeksFullTime(unempPct: number): number {
  if (unempPct <= 6) return 36;
  if (unempPct <= 7) return 38;
  if (unempPct <= 8) return 40;
  if (unempPct <= 9) return 42;
  if (unempPct <= 10) return 44;
  return 45;
}
const weeksToMonths = (w: number) => ((w * 7) / 30.44).toFixed(1);
const months1 = (r: number | null | undefined) => (r === null ? "120+" : (r ?? 0).toFixed(1));

export interface AnswerTemplate {
  text: string; // {slot} tokens, no digits
  slots: Record<string, string>;
  sources: SourceId[];
}

const TOKEN = /\{(\w+)\}/g;
const tokensOf = (s: string) => [...s.matchAll(TOKEN)].map((x) => x[1]);

/** Keep only the slots the text uses, so every token has a value. */
function make(text: string, all: Record<string, string>, sources: SourceId[] = []): AnswerTemplate {
  const slots: Record<string, string> = {};
  for (const k of tokensOf(text)) {
    if (!(k in all)) throw new Error(`ask: missing slot ${k}`);
    slots[k] = all[k];
  }
  return { text, slots, sources };
}

export function answerTemplate(q: QuestionId, m: Metrics, shock: Shock, mode: Mode): AnswerTemplate {
  const c = planCards(m, shock, mode);
  const sc = scenario(m, shock, mode);
  const f = c.facts;
  const g = f.fund;
  const dur = shock.durationMonths;
  const eiWeeks = eiWeeksFullTime(m.unemp);
  const all: Record<string, string> = {
    one_off: money(c.oneOff),
    savings: money(sc.bufferLeft),
    spending: money(sc.spending),
    income: money(c.income),
    gap: money(Math.max(sc.gap, 0)),
    runway: months1(c.nothing.runway),
    dur: String(dur),
    search_weeks: String(AVG_SEARCH_WEEKS),
    search_months: weeksToMonths(AVG_SEARCH_WEEKS),
    search_date: AVG_SEARCH_DATE,
    unemp: m.unemp.toFixed(1),
    ei_weeks: String(eiWeeks),
    ei_months: weeksToMonths(eiWeeks),
    ei_min: String(EI_WEEKS_MIN),
    ei_max: String(EI_WEEKS_MAX),
    advice: "3–6", // the usual "3 to 6 months" rule of thumb (CIRO)
    goal_target: compact(g.target),
    job_gap: money(g.target / 6),
    fixed: money(m.F),
    flex: money(m.disc),
    lean: money(m.lean),
    cap: `${Math.round(LEAN_CUT_MAX * 100)}%`,
    spread_months: "12",
    overspend: money(Math.max(0, -g.surplus)),
    loan: money(m.P),
    surplus: money(g.surplus),
    half: money(g.monthly),
    slow_months: String(g.monthsToGoal ?? ""),
    trim_pct: "10%",
    trim: money(Math.max(0, g.fastMonthly - g.monthly)),
    monthly_save: money(f.save),
    goal_months: String(f.whenMonths ?? ""),
  };

  if (q === "last") {
    if (f.wiped) return make("The bill is {one_off} and they only have {savings} saved, so it can't be paid from savings.", all);
    if (shock.jobLoss && c.income === 0)
      return make("With no income coming in, they spend {spending} a month, which empties their {savings} in {runway} months.", all);
    if (c.nothing.runway === null)
      return make(
        `As long as they need: even after the ${shock.jobLoss ? "layoff" : "shock"}, {income} comes in and only {spending} goes out each month.`,
        all,
      );
    return make(
      `${shock.jobLoss ? "On EI they get" : "They get"} {income} a month but spend {spending}. That {gap} gap empties their {savings} in {runway} months.`,
      all,
    );
  }

  if (q === "layoff") {
    if (!shock.jobLoss) return make("This shock isn't a layoff, so there's no layoff length to estimate.", all);
    const r = c.nothing.runway as number | null;
    const eiMonths = (eiWeeks * 7) / 30.44;
    const searchMonths = (AVG_SEARCH_WEEKS * 7) / 30.44;
    const tail =
      r === null
        ? "Their savings never run out, so they're covered either way."
        : r >= eiMonths
          ? "Their savings last {runway} months, longer than EI itself."
          : r >= searchMonths
            ? "Their savings last {runway} months: enough for an average search, but not if it runs to the end of EI."
            : "Their savings last only {runway} months, less than an average job search.";
    return make(
      "Nobody knows for sure, but there are two guides. The average job search in Canada is {search_weeks} weeks, about {search_months} months (Statistics Canada, {search_date}). " +
        "In their region ({unemp}% unemployment), EI lasts up to {ei_weeks} weeks, about {ei_months} months, for a full-time worker. " +
        tail,
      all,
      ["statcan", "schedule"],
    );
  }

  if (q === "why6") {
    const intro = shock.jobLoss
      ? shock.incomePct === 0
        ? "The twist says the layoff lasts {dur} months with no EI, so their money has to last that long. In real life EI lasts {ei_min} to {ei_max} weeks for people who qualify."
        : "The twist card says EI lasts {dur} months, so their money has to last that long. In real life EI lasts {ei_min} to {ei_max} weeks, depending on the region."
      : "This shock has no end date like a layoff, so we check their money still lasts the next {dur} months.";
    const reason = g.targetReason.startsWith("enough")
      ? "The emergency fund is {fund_mult} months of the {job_gap} monthly gap on EI: {goal_target}, in line with the usual {advice} months advice."
      : g.targetReason.startsWith("3 months")
        ? "The emergency fund is {fund_mult} months of fixed costs ({fixed} a month): {goal_target}, in line with the usual {advice} months advice."
        : "The emergency fund is one month of spending: {goal_target}.";
    const short = f.longState === "saving" && (c.long.state === "mid" || c.long.state === "bad");
    const fundMult = g.targetReason.startsWith("enough") ? "6" : "3";
    return make(
      `${intro} ${reason}${short ? " This twist is longer than the fund covers, so the fund alone falls short." : ""}`,
      { ...all, fund_mult: fundMult },
      shock.jobLoss ? ["schedule", "ei", "fund"] : ["fund"],
    );
  }

  if (q === "cut") {
    const lead =
      "Flexible spending (card, cash and other transfers) is normally {flex} a month. Bills, insurance and loans are must-pays, so they stay. ";
    if (f.wiped) return make("For a one-off bill, the plan doesn't cut spending. It spreads the {one_off} bill over {spread_months} months instead.", all);
    if (f.safe)
      return c.nothing.runway === null
        ? make("They don't need a cut: their savings already cover the {dur} months they need.", all)
        : make("They don't need a cut: their savings already last {runway} months, longer than the {dur} they need.", all);
    if (m.disc <= 0) return make("They have no flexible spending to cut. Everything they spend is bills, insurance or loans.", all);
    if (f.capped)
      return make(
        lead +
          "Their leanest months dropped to {lean}, which isn't realistic to keep up, so the cut is capped at {cap}, about what a typical customer's lean month looks like.",
        all,
      );
    return make(lead + "In their leanest months they spent only {lean}, so going back to that level is something they've already done.", all);
  }

  // saving
  if (f.longState === "funded") return make("They don't need to save more: their {savings} already covers the {goal_target} goal.", { ...all, savings: money(m.B) });
  if (f.longState === "blocked") {
    if (g.surplus <= 0)
      return make(
        "They can't save yet: they spend {overspend} a month more than they earn." + (m.P > 0 ? " Pausing the {loan} loan payment is the first step." : ""),
        all,
      );
    return make("Saving at today's pace would take {goal_months} months, too long to count on.", { ...all, goal_months: String(g.monthsToGoal ?? "") });
  }
  if (g.surplus <= 0)
    return make(
      "They spend {overspend} a month more than they earn, so the plan first trims flexible spending to close the gap, then saves {monthly_save} a month, reaching {goal_target} in {goal_months} months.",
      all,
    );
  if (f.useFast)
    return make(
      "They have {surplus} left over each month. Saving half ({half}) would take {slow_months} months, so the plan adds a {trim_pct} trim of flexible spending ({trim}). Together that's {monthly_save} a month, reaching {goal_target} in {goal_months} months.",
      all,
    );
  return make("They save half of the {surplus} left over each month: {half}, reaching {goal_target} in {goal_months} months.", all);
}

export type Segment = { text: string } | { num: string };

/** Split a template into plain text and engine numbers (slots render highlighted). */
export function toSegments(text: string, slots: Record<string, string>): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const mt of text.matchAll(TOKEN)) {
    const i = mt.index ?? 0;
    if (!(mt[1] in slots)) continue;
    if (i > last) out.push({ text: text.slice(last, i) });
    out.push({ num: slots[mt[1]] });
    last = i + mt[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const MAX_REPLY = 600;

/** Accept a model reply only if it is `{ text }` with no digit, no unknown slot, no stray brace, and every slot the template used. */
export function checkAnswer(reply: unknown, t: AnswerTemplate): { ok: true; text: string } | { ok: false; reason: string } {
  if (!reply || typeof reply !== "object" || typeof (reply as { text?: unknown }).text !== "string") return { ok: false, reason: "shape" };
  const text = (reply as { text: string }).text.trim();
  if (!text || text.length > MAX_REPLY) return { ok: false, reason: "length" };
  if (/\d/.test(text)) return { ok: false, reason: "digit" };
  const used = tokensOf(text);
  if (used.some((k) => !(k in t.slots))) return { ok: false, reason: "unknown slot" };
  if (/[{}]/.test(text.replace(TOKEN, ""))) return { ok: false, reason: "stray brace" };
  const have = new Set(used);
  if (tokensOf(t.text).some((k) => !have.has(k))) return { ok: false, reason: "dropped slot" };
  return { ok: true, text };
}

export function buildAskPrompt(t: AnswerTemplate): string {
  const slotList = Object.keys(t.slots)
    .map((k) => `  {${k}}`)
    .join("\n");
  return [
    "You reword a short answer in a personal-finance app, in warm plain English, for someone who is not an expert.",
    "Rules:",
    "1. Never write any digit (0-9) and never spell out a number as a figure. Wherever a number belongs, keep the slot exactly as shown, with braces.",
    "2. Use only these slots, and keep every one of them. Do not invent any other slot:",
    slotList,
    "3. Do not invent facts, products, rates or promises. Say only what the original says.",
    '4. Return JSON with exactly one key: text (the reworded answer, at most 500 characters).',
    "",
    "Original answer:",
    t.text,
  ].join("\n");
}

export const ASK_SCHEMA = { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] };

export interface Answer {
  segments: Segment[];
  sources: { label: string; url: string }[];
  source: "gemini" | "template";
  rejected?: string;
}

/** Ask the model for a warmer wording and check it; on any failure return the template. Never throws. */
export async function answer(q: QuestionId, m: Metrics, shock: Shock, mode: Mode, call: ModelCall | null): Promise<Answer> {
  const t = answerTemplate(q, m, shock, mode);
  const sources = t.sources.map((s) => SOURCES[s]);
  const fallback = (rejected?: string): Answer => ({ segments: toSegments(t.text, t.slots), sources, source: "template", rejected });
  if (!call) return fallback();
  try {
    const checked = checkAnswer(await call(buildAskPrompt(t)), t);
    if (!checked.ok) return fallback(checked.reason);
    return { segments: toSegments(checked.text, t.slots), sources, source: "gemini" };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "error");
  }
}

export function sanitizeQuestion(raw: unknown): QuestionId | null {
  return QUESTIONS.some((x) => x.id === raw) ? (raw as QuestionId) : null;
}

/* ------------------------------------------------------------------ input checks (moved from explain.ts) */

const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** Validate a shock coming from the browser. Returns null if anything is off. */
export function sanitizeShock(raw: unknown): Shock | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const incomePct = num(r.incomePct, 0, 2);
  const billsPct = num(r.billsPct, -1, 2);
  const extraMonthly = num(r.extraMonthly, 0, 20_000);
  const oneOffMult = num(r.oneOffMult, 0, 12);
  const oneOffAbs = num(r.oneOffAbs, 0, 200_000);
  const durationMonths = num(r.durationMonths, 1, 24);
  if ([incomePct, billsPct, extraMonthly, oneOffMult, oneOffAbs, durationMonths].some((x) => x === null)) return null;
  if (typeof r.jobLoss !== "boolean") return null;
  return {
    incomePct: incomePct!,
    jobLoss: r.jobLoss,
    billsPct: billsPct!,
    extraMonthly: extraMonthly!,
    oneOffMult: oneOffMult!,
    oneOffAbs: oneOffAbs!,
    durationMonths: durationMonths!,
  };
}

export function sanitizeMode(raw: unknown): Mode | null {
  return raw === "judge" || raw === "realistic" ? raw : null;
}
