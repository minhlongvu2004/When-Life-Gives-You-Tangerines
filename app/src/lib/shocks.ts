// Shock library, field rules, custom shocks and the duration-aware projection.
// All arithmetic goes through engine.scenario(), so the judged runway is unchanged.

import { money, NO_SHOCK, pct, scenario, type Metrics, type Mode, type Shock } from "./engine";
import { addMonths, MONTHS, type YM } from "./whatif/scenarios";

/* ------------------------------------------------------------------ presets */

export type ShockCategory = "income" | "housing" | "emergency" | "combined";

export const CATEGORIES: { key: ShockCategory; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "housing", label: "Housing & living" },
  { key: "emergency", label: "Emergencies" },
  { key: "combined", label: "Combined" },
];

export interface ShockPreset {
  key: string;
  category: ShockCategory;
  title: string;
  /** one of the brief's twist scenarios: values must never change */
  datathon?: boolean;
  /** what the default values assume, in plain words */
  assumption: string;
  build: (m: Metrics) => Shock;
}

const fixed = (s: Partial<Shock>) => () => ({ ...NO_SHOCK, ...s });
const r50 = (x: number) => Math.round(x / 50) * 50;

export const SHOCK_PRESETS: ShockPreset[] = [
  // income
  {
    key: "job",
    category: "income",
    title: "Job loss with EI",
    datathon: true,
    assumption: "EI pays 55% of usual income for 6 months.",
    build: fixed({ jobLoss: true, incomePct: 0.55, durationMonths: 6 }),
  },
  {
    key: "job-no-ei",
    category: "income",
    title: "Job loss without EI",
    assumption: "No income at all for 6 months (not eligible for EI).",
    build: fixed({ jobLoss: true, incomePct: 0, durationMonths: 6 }),
  },
  { key: "cut-25", category: "income", title: "Income down 25%", assumption: "75% of usual income for 12 months.", build: fixed({ incomePct: 0.75, durationMonths: 12 }) },
  { key: "cut-50", category: "income", title: "Income down 50%", assumption: "Half of usual income for 12 months.", build: fixed({ incomePct: 0.5, durationMonths: 12 }) },
  { key: "unpaid-leave", category: "income", title: "Temporary unpaid leave", assumption: "No income for 2 months, then back to normal.", build: fixed({ incomePct: 0, durationMonths: 2 }) },
  { key: "delayed-pay", category: "income", title: "Delayed salary", assumption: "One month's pay arrives late, so one month with no income.", build: fixed({ incomePct: 0, durationMonths: 1 }) },
  {
    key: "second-income",
    category: "income",
    title: "Loss of secondary income",
    assumption: "A side income worth 30% of the total stops, for 12 months.",
    build: fixed({ incomePct: 0.7, durationMonths: 12 }),
  },
  { key: "fewer-hours", category: "income", title: "Reduced working hours", assumption: "A four-day week: 80% of usual income for 6 months.", build: fixed({ incomePct: 0.8, durationMonths: 6 }) },

  // housing and living
  { key: "rent-10", category: "housing", title: "Rent up 10%", assumption: "Household bills (rent included) +10% for 12 months.", build: fixed({ billsPct: 0.1, durationMonths: 12 }) },
  {
    key: "rent",
    category: "housing",
    title: "Rent goes up 15%",
    datathon: true,
    assumption: "Household bills +15% for 12 months.",
    build: fixed({ billsPct: 0.15, durationMonths: 12 }),
  },
  { key: "rent-20", category: "housing", title: "Rent up 20%", assumption: "Household bills (rent included) +20% for 12 months.", build: fixed({ billsPct: 0.2, durationMonths: 12 }) },
  {
    key: "utilities-25",
    category: "housing",
    title: "Utility bills up 25%",
    assumption: "The data records rent and utilities as one household-bills total, so +25% applies to all of it (an upper bound). Lower it if rent isn't changing.",
    build: fixed({ billsPct: 0.25, durationMonths: 12 }),
  },
  {
    key: "groceries",
    category: "housing",
    title: "Groceries & household costs up",
    assumption: "Everyday card and cash spending rises 10%, for 12 months.",
    build: (m) => ({ ...NO_SHOCK, extraMonthly: r50(0.1 * m.disc), durationMonths: 12 }),
  },
  {
    key: "insurance",
    category: "housing",
    title: "Insurance premiums up",
    assumption: "This account's insurance payments rise 20%, for 12 months.",
    build: (m) => ({ ...NO_SHOCK, extraMonthly: Math.round(0.2 * m.ins), durationMonths: 12 }),
  },
  { key: "transport", category: "housing", title: "Transportation costs up", assumption: "An extra $150 a month for fuel, transit or parking, for 12 months.", build: fixed({ extraMonthly: 150, durationMonths: 12 }) },

  // emergencies (one-off costs)
  {
    key: "furnace",
    category: "emergency",
    title: "Emergency home repair",
    datathon: true,
    assumption: "The furnace dies: a bill equal to one month of usual spending.",
    build: fixed({ oneOffMult: 1 }),
  },
  { key: "car", category: "emergency", title: "Emergency car repair", assumption: "A $1,500 repair bill.", build: fixed({ oneOffAbs: 1500 }) },
  { key: "medical", category: "emergency", title: "Medical or dental bill", assumption: "A $1,200 bill not covered by insurance.", build: fixed({ oneOffAbs: 1200 }) },
  { key: "travel", category: "emergency", title: "Emergency travel", assumption: "$2,000 for last-minute flights and a stay.", build: fixed({ oneOffAbs: 2000 }) },
  { key: "appliance", category: "emergency", title: "Appliance replacement", assumption: "A $1,000 fridge or washer.", build: fixed({ oneOffAbs: 1000 }) },
  { key: "large", category: "emergency", title: "Sudden large expense", assumption: "A bill equal to two months of usual spending.", build: fixed({ oneOffMult: 2 }) },

  // combined
  {
    key: "combo",
    category: "combined",
    title: "Job loss + bills up 15%",
    datathon: true,
    assumption: "EI pays 55% and household bills rise 15%, for 6 months.",
    build: fixed({ jobLoss: true, incomePct: 0.55, billsPct: 0.15, durationMonths: 6 }),
  },
  {
    key: "cut-repair",
    category: "combined",
    title: "Income cut + emergency repair",
    assumption: "75% of income for 6 months, plus a repair costing one month of spending.",
    build: fixed({ incomePct: 0.75, oneOffMult: 1, durationMonths: 6 }),
  },
  {
    key: "rent-transport",
    category: "combined",
    title: "Rent up + transport costs",
    assumption: "Household bills +10% and an extra $150 a month for transport, for 12 months.",
    build: fixed({ billsPct: 0.1, extraMonthly: 150, durationMonths: 12 }),
  },
  {
    key: "job-expense",
    category: "combined",
    title: "Job loss + one-time expense",
    assumption: "EI pays 55% for 6 months, plus a $2,000 emergency bill.",
    build: fixed({ jobLoss: true, incomePct: 0.55, oneOffAbs: 2000, durationMonths: 6 }),
  },
  {
    key: "perfect-storm",
    category: "combined",
    title: "Several things at once",
    assumption: "75% of income, bills +10%, an extra $200 a month and a $1,500 bill, for 6 months.",
    build: fixed({ incomePct: 0.75, billsPct: 0.1, extraMonthly: 200, oneOffAbs: 1500, durationMonths: 6 }),
  },
];

/** Short plain-English summary, e.g. "Laid off, EI 55% + bills +15%". Empty when nothing changes. */
export function shockLabel(s: Shock): string {
  const parts: string[] = [];
  if (s.jobLoss) parts.push(`laid off, EI ${pct(s.incomePct)}`);
  else if (s.incomePct !== 1) parts.push(`income ${pct(s.incomePct)} of usual`);
  if (s.billsPct) parts.push(`bills ${s.billsPct > 0 ? "+" : "−"}${pct(Math.abs(s.billsPct))}`);
  if (s.extraMonthly) parts.push(`+${money(s.extraMonthly)}/mo`);
  if (s.oneOffMult) parts.push(`${s.oneOffMult === 1 ? "a" : s.oneOffMult + "×"} month of spending one-off`);
  if (s.oneOffAbs) parts.push(`${money(s.oneOffAbs)} one-off`);
  const out = parts.join(" + ");
  return out ? out[0].toUpperCase() + out.slice(1) : "";
}
export const isShock = (s: Shock) => shockLabel(s) !== "";

export const sameShock = (a: Shock, b: Shock) =>
  a.jobLoss === b.jobLoss &&
  (["incomePct", "billsPct", "extraMonthly", "oneOffMult", "oneOffAbs", "durationMonths"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-9);

/* ------------------------------------------------------------------ field rules
   Limits match the server's sanitizeShock() so any shock built here can be answered by /api/ask. */

export type FieldKey = "incomePct" | "billsPct" | "extraMonthly" | "oneOffMult" | "oneOffAbs" | "durationMonths";

export interface FieldSpec {
  key: FieldKey;
  label: string;
  unit: "%" | "$" | "×" | "months";
  /** shown value = stored value × scale (percentages are stored as shares) */
  scale: number;
  min: number;
  max: number;
  /** the slider can stop short of max; the number box still takes up to max */
  sliderMax: number;
  sliderMin: number;
  step: number;
  integer?: boolean;
  help: string;
}

export const FIELDS: FieldSpec[] = [
  {
    key: "incomePct",
    label: "Income after shock",
    unit: "%",
    scale: 100,
    min: 0,
    max: 100,
    sliderMin: 0,
    sliderMax: 100,
    step: 1,
    help: "The percentage of your usual monthly income you will still receive after the shock. For example, 55% means you receive $550 for every $1,000 you normally earn.",
  },
  {
    key: "billsPct",
    label: "Bills / rent",
    unit: "%",
    scale: 100,
    min: -100,
    max: 200,
    sliderMin: -50,
    sliderMax: 100,
    step: 1,
    help: "How much your household bills or rent increase or decrease compared with normal. For example, +15% means your usual $1,000 household bills become $1,150.",
  },
  {
    key: "extraMonthly",
    label: "Extra per month",
    unit: "$",
    scale: 1,
    min: 0,
    max: 20000,
    sliderMin: 0,
    sliderMax: 3000,
    step: 50,
    help: "An additional expense you must pay every month while the shock lasts. For example, an extra $200 for transportation, childcare, or temporary living costs.",
  },
  {
    key: "oneOffMult",
    label: "One-off (× spending)",
    unit: "×",
    scale: 1,
    min: 0,
    max: 12,
    sliderMin: 0,
    sliderMax: 6,
    step: 0.25,
    help: "A one-time emergency cost measured as a multiple of your usual monthly spending. For example, 1× means an unexpected cost equal to one typical month of spending.",
  },
  {
    key: "oneOffAbs",
    label: "One-off ($)",
    unit: "$",
    scale: 1,
    min: 0,
    max: 200000,
    sliderMin: 0,
    sliderMax: 20000,
    step: 250,
    help: "A one-time expense entered directly in Canadian dollars. For example, a $1,500 repair bill.",
  },
  {
    key: "durationMonths",
    label: "Lasts",
    unit: "months",
    scale: 1,
    min: 1,
    max: 24,
    sliderMin: 1,
    sliderMax: 24,
    step: 1,
    integer: true,
    help: "How many months the shock continues. For example, 6 months means the monthly income and expense changes apply for six months. One-time costs are applied only once.",
  },
];
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldSpec>;

/** Check a value typed by the user, in display units. Returns an error message or null. */
export function validateField(f: FieldSpec, raw: string): { value: number | null; error: string | null } {
  const t = raw.replace(/[$,%×\s]/g, "").replace(/^\+/, "").replace("−", "-");
  if (t === "" || t === "-" || t === ".") return { value: null, error: "Enter a number." };
  const v = Number(t);
  if (!Number.isFinite(v)) return { value: null, error: "That isn't a number." };
  if (f.integer && !Number.isInteger(v)) return { value: null, error: "Use whole months." };
  const unit = (x: number) => (f.unit === "$" ? `$${x.toLocaleString("en-CA")}` : f.unit === "months" ? `${x} month${x === 1 ? "" : "s"}` : `${x}${f.unit}`);
  if (v < f.min) return { value: null, error: f.min === 0 && f.unit === "$" ? "Can't be negative." : `The lowest is ${unit(f.min)}.` };
  if (v > f.max) return { value: null, error: `The highest is ${unit(f.max)}.` };
  return { value: v, error: null };
}

export function toDisplay(f: FieldSpec, s: Shock): number {
  return Math.round(s[f.key] * f.scale * 1e6) / 1e6;
}
export function fromDisplay(f: FieldSpec, v: number): number {
  return v / f.scale;
}

/** Clamp every field into range (for shocks loaded from storage or typed by hand). */
export function clampShock(s: Partial<Shock>): Shock {
  const out = { ...NO_SHOCK, jobLoss: !!s.jobLoss };
  for (const f of FIELDS) {
    const raw = Number(s[f.key]);
    const v = Number.isFinite(raw) ? raw * f.scale : toDisplay(f, NO_SHOCK);
    const c = Math.min(f.max, Math.max(f.min, f.integer ? Math.round(v) : v));
    out[f.key] = c / f.scale;
  }
  return out;
}

/* ------------------------------------------------------------------ projection */

export interface ProjectionPoint {
  t: number; // months since the shock started (0 = start, after one-off costs)
  label: string;
  balance: number;
  baseline: number;
  phase: "start" | "shock" | "after";
}

export interface Projection {
  start: YM;
  points: ProjectionPoint[];
  duration: number;
  /** months from the start until savings hit zero (fractional), or null if they never do within the horizon */
  exhaustedAt: number | null;
  /** calendar month savings run out in */
  exhaustedMonth: YM | null;
  /** did they run out while the shock was still on? */
  exhaustedDuringShock: boolean;
  bufferAfterOneOff: number;
  balanceAtShockEnd: number;
  lowest: { t: number; balance: number };
  /** monthly change in savings after the shock ends (positive = rebuilding) */
  afterGap: number;
  horizon: number;
}

export const ymLabel = (a: YM) => `${MONTHS[a.m - 1]} ${a.y}`;

/**
 * Month-by-month balance: one-off costs come off at the start, the shock's monthly effects apply for
 * `durationMonths`, then the customer's usual income and spending resume. Point t is the balance at
 * the end of month t (month 1 is the start month).
 */
export function projectShock(m: Metrics, s: Shock, mode: Mode, start: YM, horizon?: number): Projection {
  const H = horizon ?? Math.min(36, Math.max(18, s.durationMonths + 12));
  const shocked = scenario(m, s, mode);
  const base = scenario(m, NO_SHOCK, mode);
  const points: ProjectionPoint[] = [];
  let bal = m.B - shocked.oneOff;
  let baseBal = m.B;
  points.push({ t: 0, label: `Start · ${ymLabel(start)}`, balance: bal, baseline: baseBal, phase: "start" });
  for (let t = 1; t <= H; t++) {
    const inShock = t <= s.durationMonths;
    bal -= inShock ? shocked.gap : base.gap;
    baseBal -= base.gap;
    points.push({ t, label: ymLabel(addMonths(start, t - 1)), balance: bal, baseline: baseBal, phase: inShock ? "shock" : "after" });
  }

  let exhaustedAt: number | null = null;
  if (points[0].balance <= 0) exhaustedAt = 0;
  else
    for (let t = 1; t < points.length; t++) {
      const a = points[t - 1].balance;
      const b = points[t].balance;
      if (b < 0) {
        exhaustedAt = t - 1 + a / (a - b);
        break;
      }
    }
  const exhaustedMonth = exhaustedAt === null ? null : addMonths(start, Math.max(0, Math.ceil(exhaustedAt) - 1));
  const lowest = points.reduce((lo, p) => (p.balance < lo.balance ? { t: p.t, balance: p.balance } : lo), { t: 0, balance: points[0].balance });
  return {
    start,
    points,
    duration: s.durationMonths,
    exhaustedAt,
    exhaustedMonth,
    exhaustedDuringShock: exhaustedAt !== null && exhaustedAt <= s.durationMonths,
    bufferAfterOneOff: points[0].balance,
    balanceAtShockEnd: points[Math.min(s.durationMonths, H)].balance,
    lowest,
    afterGap: -base.gap,
    horizon: H,
  };
}

/* ------------------------------------------------------------------ custom shocks */

export interface CustomShock {
  id: string;
  name: string;
  description: string;
  shock: Shock;
  /** YYYY-MM, or null to start this month */
  start: string | null;
}

const STORE_KEY = "tangerine.customShocks.v1";

export function loadCustomShocks(): CustomShock[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && x.shock && typeof x.shock === "object")
      .map((x) => ({
        id: x.id,
        name: String(x.name).slice(0, 60),
        description: typeof x.description === "string" ? x.description.slice(0, 200) : "",
        shock: clampShock(x.shock),
        start: typeof x.start === "string" && /^\d{4}-\d{2}$/.test(x.start) ? x.start : null,
      }));
  } catch {
    return [];
  }
}

export function saveCustomShocks(list: CustomShock[]): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newShockId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
