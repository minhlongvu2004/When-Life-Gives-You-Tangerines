// Plan explanations. The rules engine owns every number; Gemini only writes the words.
//
//   engine.ts  ->  planFacts()  ->  slot values ({runway_now}: "0.9", ...)
//   Gemini     ->  text with {slots} and NO digits
//   checkReply ->  rejects any digit, unknown slot, or wrong step list
//   fillSlots  ->  the engine's numbers go in
//
// If anything goes wrong (error, timeout, rejected reply) the template below is used,
// so the plan always works. Only imported by the server (the /api/plan route).

import {
  backupPlan,
  formatRunway,
  goalPlan,
  type Metrics,
  type Mode,
  type Shock,
} from "./engine";

export type SlotName =
  | "runway_now"
  | "trim_gain"
  | "loan_gain"
  | "survival_gain"
  | "goal_target"
  | "goal_months"
  | "monthly_save";
export type StepId = "ei" | "trim" | "loan" | "survival" | "goal";

export interface Explanation {
  headline: string;
  why: string;
  steps: { id: StepId; text: string }[];
}
export interface ExplanationResult extends Explanation {
  source: "gemini" | "template";
}

export interface PlanFacts {
  /** Slots whose values exist for this customer. Gemini may only use these. */
  slots: Partial<Record<SlotName, string>>;
  /** Step ids Gemini must write, in order. */
  stepIds: StepId[];
  jobLoss: boolean;
  /** Plain-language description of what happens, for the prompt (no numbers). */
  situation: string;
  fundedAlready: boolean;
}

/* ------------------------------------------------------------------ input checks */

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

/* ------------------------------------------------------------------ facts from the engine */

const compact = (x: number) => {
  const a = Math.abs(x);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}K` : `$${Math.round(a)}`;
  return x < 0 ? `−${s}` : s;
};

const gainText = (g: number | null) => (g === null ? "the rest of the shortfall" : `${g.toFixed(1)} months`);

/** Every number in an explanation comes from here. Mirrors StepPlan in guided.tsx. */
export function planFacts(m: Metrics, shock: Shock, mode: Mode): PlanFacts {
  const steps = backupPlan(m, shock, mode);
  const first = steps[0];
  const slots: PlanFacts["slots"] = {
    runway_now: first.runway === null ? "120+" : formatRunway(first.runway),
  };
  const stepIds: StepId[] = [];
  if (shock.jobLoss) stepIds.push("ei");

  for (const s of steps.slice(1)) {
    if (s.label.startsWith("Trim")) {
      stepIds.push("trim");
      slots.trim_gain = gainText(s.gained);
    } else if (s.label.startsWith("Ask to defer")) {
      stepIds.push("loan");
      slots.loan_gain = gainText(s.gained);
    } else if (s.label.startsWith("Cut flexible")) {
      stepIds.push("survival");
      slots.survival_gain = gainText(s.gained);
    }
  }

  const g = goalPlan(m, mode, 0.5);
  const useFast =
    g.fastMonths !== null && (g.monthsToGoal === null || g.monthsToGoal > 18) && g.fastMonths < (g.monthsToGoal ?? Infinity);
  const save = useFast ? g.fastMonthly : g.monthly;
  const when = useFast ? g.fastMonths : g.monthsToGoal;
  slots.goal_target = compact(g.target);
  if (g.shortfall > 0) {
    if (save > 0) slots.monthly_save = compact(save);
    if (when !== null) slots.goal_months = String(when);
  }
  stepIds.push("goal");

  const situation = shock.jobLoss
    ? "The customer has lost their job and is relying on employment insurance."
    : "The customer faces a financial shock (lower income, higher bills or a one-off cost).";
  return { slots, stepIds, jobLoss: shock.jobLoss, situation, fundedAlready: g.shortfall === 0 };
}

/* ------------------------------------------------------------------ checker and slot filler */

const SLOT_TOKEN = /\{([^{}]*)\}/g;

export type CheckResult = { ok: true; value: Explanation } | { ok: false; reason: string };

/**
 * Accept a model reply only if it is exactly the shape we asked for, has no digit
 * anywhere, and uses only slots that exist for this customer.
 */
export function checkReply(reply: unknown, facts: Pick<PlanFacts, "slots" | "stepIds">): CheckResult {
  if (typeof reply !== "object" || reply === null) return { ok: false, reason: "not an object" };
  const r = reply as Record<string, unknown>;
  const { headline, why, steps } = r;
  if (typeof headline !== "string" || typeof why !== "string" || !Array.isArray(steps))
    return { ok: false, reason: "wrong shape" };
  if (!headline.trim() || headline.length > 120) return { ok: false, reason: "bad headline" };
  if (!why.trim() || why.length > 500) return { ok: false, reason: "bad why" };
  if (steps.length !== facts.stepIds.length) return { ok: false, reason: "wrong number of steps" };

  const texts: string[] = [headline, why];
  const out: Explanation["steps"] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] as Record<string, unknown> | null;
    if (!s || typeof s.id !== "string" || typeof s.text !== "string") return { ok: false, reason: "bad step" };
    if (s.id !== facts.stepIds[i]) return { ok: false, reason: `step ${i} should be ${facts.stepIds[i]}` };
    if (!s.text.trim() || s.text.length > 240) return { ok: false, reason: "bad step text" };
    texts.push(s.text);
    out.push({ id: s.id as StepId, text: s.text });
  }

  for (const t of texts) {
    if (/\d/.test(t)) return { ok: false, reason: "contains a digit" };
    for (const m of t.matchAll(SLOT_TOKEN)) {
      if (!(m[1] in facts.slots)) return { ok: false, reason: `unknown slot {${m[1]}}` };
    }
    // a brace that is not part of a complete {slot} token
    if (/[{}]/.test(t.replace(SLOT_TOKEN, ""))) return { ok: false, reason: "stray brace" };
  }
  return { ok: true, value: { headline, why, steps: out } };
}

export function fillSlots(text: string, slots: PlanFacts["slots"]): string {
  return text.replace(SLOT_TOKEN, (whole, name: string) => slots[name as SlotName] ?? whole);
}

export function fillExplanation(e: Explanation, slots: PlanFacts["slots"]): Explanation {
  return {
    headline: fillSlots(e.headline, slots),
    why: fillSlots(e.why, slots),
    steps: e.steps.map((s) => ({ id: s.id, text: fillSlots(s.text, slots) })),
  };
}

/* ------------------------------------------------------------------ template fallback */

/** Deterministic text, written with the same slots. Used whenever Gemini can't be trusted. */
export function templateExplanation(facts: PlanFacts): Explanation {
  const has = (n: SlotName) => n in facts.slots;
  const text: Record<StepId, string> = {
    ei: "Apply for employment insurance right away, within four weeks of the last day of work.",
    trim: has("trim_gain")
      ? "Trim flexible spending by a tenth. This adds {trim_gain} of cushion."
      : "Trim flexible spending by a tenth.",
    loan: has("loan_gain")
      ? "Ask the lender to defer the loan payment. This adds {loan_gain} of cushion."
      : "Ask the lender to defer the loan payment.",
    survival: has("survival_gain")
      ? "In the worst stretch, cut flexible spending by a quarter. This adds {survival_gain}."
      : "In the worst stretch, cut flexible spending by a quarter.",
    goal: facts.fundedAlready
      ? "Their savings already cover the {goal_target} goal. Keep it somewhere safe."
      : has("monthly_save") && has("goal_months")
        ? "Save {monthly_save} a month to be fully ready in {goal_months} months."
        : "First stop the monthly shortfall, then build toward the {goal_target} goal.",
  };
  return {
    headline: "Savings would last {runway_now} months at this pace.",
    why: facts.fundedAlready
      ? "The plan below stretches that cushion, and their emergency fund is already in good shape."
      : "The plan below stretches that cushion, then builds an emergency fund so the next shock lands softer.",
    steps: facts.stepIds.map((id) => ({ id, text: text[id] })),
  };
}

/* ------------------------------------------------------------------ prompt and Gemini call */

/** What each slot means, so the model can't use one with the wrong meaning. */
const SLOT_MEANING: Record<SlotName, string> = {
  runway_now: 'how many months their savings last RIGHT NOW under this shock, a bare number, write it as "{runway_now} months"',
  trim_gain: 'the EXTRA time this one step adds, already ends in "months" (write "adds {trim_gain}"). It is NOT the total runway',
  loan_gain: 'the EXTRA time this one step adds, already ends in "months" (write "adds {loan_gain}"). It is NOT the total runway',
  survival_gain: 'the EXTRA time this one step adds, already ends in "months" (write "adds {survival_gain}"). It is NOT the total runway',
  goal_target: "the dollar size of the emergency fund goal, already has a dollar sign",
  goal_months: 'how many months until the goal is reached, a bare number, write it as "{goal_months} months"',
  monthly_save: 'dollars to put aside EACH month, already has a dollar sign, write it as "{monthly_save} a month"',
};

export function buildPrompt(facts: PlanFacts): string {
  const slotList = (Object.keys(facts.slots) as SlotName[])
    .map((k) => `  {${k}}: ${SLOT_MEANING[k]}`)
    .join("\n");
  return [
    "You write short, warm, plain-English explanations of a personal-finance plan for a bank customer.",
    facts.situation,
    "",
    "STRICT RULES:",
    "1. Never write any digit (0-9) and never spell out a number as a figure. Wherever a number belongs, write one of the slots below, exactly as shown, with braces.",
    "2. Use only these slots. Do not invent any other slot:",
    slotList,
    "3. Do not invent facts, products, interest rates or promises. Only describe the steps listed.",
    `4. Return JSON with exactly these keys: headline (max 90 chars), why (1-2 sentences), steps (an array with EXACTLY these ids in this order: ${facts.stepIds.join(", ")}). Each step is {"id": ..., "text": ...} with one short sentence.`,
    "",
    "Step meanings:",
    "  ei: apply for employment insurance quickly",
    "  trim: trim flexible spending by a small share",
    "  loan: ask the lender to defer the loan payment",
    "  survival: cut flexible spending harder, must-pay bills only",
    "  goal: build an emergency fund (use {goal_target}, and {monthly_save} and {goal_months} if they exist)",
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    why: { type: "STRING" },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, text: { type: "STRING" } },
        required: ["id", "text"],
      },
    },
  },
  required: ["headline", "why", "steps"],
};

export const GEMINI_TIMEOUT_MS = 5000;

export type ModelCall = (prompt: string) => Promise<unknown>;

/** Real Gemini call (REST). Throws on any HTTP error, timeout or unparseable reply. */
export function geminiCall(opts: { apiKey: string; model: string; fetchImpl?: typeof fetch }): ModelCall {
  const f = opts.fetchImpl ?? fetch;
  return async (prompt) => {
    const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return JSON.parse(text);
  };
}

/**
 * Ask the model for words, check them, fill the engine's numbers. On any failure,
 * return the template instead. Never throws.
 */
export async function explain(
  facts: PlanFacts,
  callModel: ModelCall | null,
): Promise<ExplanationResult & { rejected?: string }> {
  const fallback = (rejected?: string) => ({
    ...fillExplanation(templateExplanation(facts), facts.slots),
    source: "template" as const,
    ...(rejected ? { rejected } : {}),
  });
  if (!callModel) return fallback("no model configured");
  try {
    const reply = await callModel(buildPrompt(facts));
    const checked = checkReply(reply, facts);
    if (!checked.ok) return fallback(checked.reason);
    return { ...fillExplanation(checked.value, facts.slots), source: "gemini" };
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "model error");
  }
}
