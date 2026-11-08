// What If scenarios: each life decision has its own inputs and compiles them into monthly
// money streams and one-off amounts that the simulator (simulate.ts) runs month by month.
// Nothing here is random: every number comes from the customer's data or a user input.

import type { Metrics } from "../engine";

export type ScenarioKind = "job" | "move" | "car" | "house" | "school" | "side" | "save" | "spend" | "custom";

export type FieldKind =
  | "money" // one-time dollars, >= 0
  | "monthly" // dollars per month, >= 0
  | "monthlySigned" // dollars per month, can be negative (a saving)
  | "pct" // 0..100
  | "rate" // annual interest %, decimals allowed
  | "months"
  | "years"
  | "date" // YYYY-MM
  | "text";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

export type Values = Record<string, number | string>;

/** Monthly change. kind decides whether it adds to income or to expenses; amount may be negative. */
export interface Stream {
  label: string;
  kind: "income" | "expense";
  amount: number;
  from: number; // first month it applies (1 = next month)
  to?: number; // last month it applies, inclusive; undefined = keeps going
  rampMonths?: number; // grows linearly to the full amount over this many months
  certain?: boolean; // a direct consequence of the decision, not touched by the good/bad assumptions
}

/** One-time amount. Positive = money in, negative = money out. */
export interface OneOff {
  label: string;
  amount: number;
  at: number;
  certain?: boolean;
}

export interface Compiled {
  start: number;
  streams: Stream[];
  oneOffs: OneOff[];
  events: { at: number; title: string; detail: string }[];
  derived: { label: string; value: number; unit: "monthly" | "money" }[];
}

/** How the two futures differ. Every value is editable by the user. */
export interface Assumptions {
  delayMonths: number; // gains (new pay, savings habits) arrive this many months late
  upsidePct: number; // share of the expected gain that actually shows up
  costPct: number; // one-time costs come in at this share of the estimate
  expensePct: number; // new monthly costs come in at this share of the estimate
  inflationPct: number; // everyday spending rises this much a year
}

export const WELL_DEFAULT: Assumptions = { delayMonths: 0, upsidePct: 100, costPct: 100, expensePct: 100, inflationPct: 2 };
export const BAD_DEFAULT: Assumptions = { delayMonths: 2, upsidePct: 85, costPct: 125, expensePct: 115, inflationPct: 4 };

export interface ScenarioDef {
  kind: ScenarioKind;
  title: string; // "What if I get a new job?"
  short: string; // "New job"
  blurb: string;
  fields: FieldDef[];
  defaults: (m: Metrics, now: YM) => Values;
  compile: (v: Values, m: Metrics, now: YM) => Compiled;
  /** "take a new job paying $5,200 a month from March 2027" */
  decision: (v: Values, m: Metrics, now: YM) => string;
  words: { delay: string; upside: string; gain: string };
  bad?: Partial<Assumptions>;
}

/* ------------------------------------------------------------------ dates */

export interface YM {
  y: number;
  m: number; // 1..12
}
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * The last month in the datasets (monthly_summary.csv and transactions.csv end in 2025-12).
 * Every projection starts here: the starting balances ARE the Dec 2025 snapshot, so counting
 * from today's calendar month would silently skip the months in between (and, for example,
 * treat loans still running at the end of 2025 as already paid off).
 */
export const DATA_AS_OF: YM = { y: 2025, m: 12 };
export const dataAsOf = (): YM => ({ ...DATA_AS_OF });
export function nowYM(d = new Date()): YM {
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}
export function addMonths(a: YM, n: number): YM {
  const i = a.y * 12 + (a.m - 1) + n;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}
export function ymString(a: YM): string {
  return `${a.y}-${String(a.m).padStart(2, "0")}`;
}
export function parseYM(s: string): YM | null {
  const r = /^(\d{4})-(\d{2})$/.exec(s);
  return r ? { y: +r[1], m: +r[2] } : null;
}
/** Month index of a YYYY-MM date relative to now (now = 0, next month = 1). */
export function offsetOf(now: YM, s: string | number | undefined): number {
  const p = typeof s === "string" ? parseYM(s) : null;
  if (!p) return 1;
  return p.y * 12 + p.m - (now.y * 12 + now.m);
}
export function monthName(now: YM, t: number, short = false): string {
  const a = addMonths(now, t);
  return short ? `${MONTHS[a.m - 1]} ${String(a.y).slice(2)}` : `${MONTHS[a.m - 1]} ${a.y}`;
}

/* ------------------------------------------------------------------ helpers */

const r50 = (x: number) => Math.max(0, Math.round(x / 50) * 50);
const num = (v: Values, k: string) => {
  const x = Number(v[k]);
  return Number.isFinite(x) ? x : 0;
};
export const cad = (x: number) => `${x < 0 ? "−" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-CA")}`;

/** Monthly loan payment (annual rate in %). */
export function payment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Start month offset, clamped so the decision always lands inside the simulation. */
export function startOf(v: Values, now: YM): number {
  return Math.min(48, Math.max(1, offsetOf(now, v.start)));
}

const date = (key = "start", label = "Starting date"): FieldDef => ({ key, label, kind: "date" });
const earnings = (m: Metrics) => Math.max(0, m.nonPensionI);

/* ------------------------------------------------------------------ the nine scenarios */

export const SCENARIOS: ScenarioDef[] = [
  {
    kind: "job",
    title: "What if I get a new job?",
    short: "New job",
    blurb: "A new paycheque, new costs, and a start date that might slip.",
    fields: [
      { key: "salary", label: "Expected monthly salary (take-home)", kind: "monthly", min: 0, max: 30000, step: 50 },
      date("start", "Expected starting date"),
      { key: "transition", label: "Job transition expenses", kind: "money", min: 0, max: 10000, step: 50, hint: "Training, equipment, clothes, time between paycheques" },
      { key: "extra", label: "Additional monthly expenses", kind: "monthly", min: 0, max: 3000, step: 25, hint: "Commute, parking, lunches, childcare" },
      { key: "relocation", label: "Possible relocation costs", kind: "money", min: 0, max: 30000, step: 100 },
    ],
    defaults: (m, now) => ({
      salary: earnings(m) > 0 ? r50(earnings(m) * 1.15) : 4000,
      start: ymString(addMonths(now, 2)),
      transition: 750,
      extra: 150,
      relocation: 0,
    }),
    compile: (v, m, now) => {
      const s = startOf(v, now);
      const streams: Stream[] = [];
      if (earnings(m) > 0) streams.push({ label: "Current pay stops", kind: "income", amount: -earnings(m), from: s, certain: true });
      streams.push({ label: "New salary", kind: "income", amount: num(v, "salary"), from: s });
      if (num(v, "extra")) streams.push({ label: "New work costs", kind: "expense", amount: num(v, "extra"), from: s });
      const oneOffs: OneOff[] = [];
      if (num(v, "transition")) oneOffs.push({ label: "Job transition costs", amount: -num(v, "transition"), at: s });
      if (num(v, "relocation")) oneOffs.push({ label: "Relocation", amount: -num(v, "relocation"), at: s });
      return { start: s, streams, oneOffs, events: [], derived: [] };
    },
    decision: (v, m, now) =>
      `take a new job paying ${cad(num(v, "salary"))} a month take-home${earnings(m) > 0 ? ` (your usual earnings are about ${cad(earnings(m))})` : ""}, starting ${monthName(now, startOf(v, now))}`,
    words: { delay: "New job starts late (months with no pay)", upside: "Share of expected salary received", gain: "new salary" },
    bad: { delayMonths: 2 },
  },
  {
    kind: "move",
    title: "What if I move to another city?",
    short: "Move cities",
    blurb: "A new rent, a moving truck, and a different cost of living.",
    fields: [
      { key: "rent", label: "New monthly rent", kind: "monthly", min: 0, max: 8000, step: 25, hint: "Compared with the household bills you pay today" },
      { key: "moving", label: "Moving expenses", kind: "money", min: 0, max: 20000, step: 100, hint: "Truck, deposit, first-and-last, furniture" },
      { key: "utilities", label: "Utility changes (per month)", kind: "monthlySigned", min: -500, max: 800, step: 10 },
      { key: "transport", label: "Transportation changes (per month)", kind: "monthlySigned", min: -800, max: 1500, step: 10 },
      date("start", "Moving date"),
    ],
    defaults: (m, now) => ({
      rent: m.H > 0 ? r50(m.H * 1.2) : 1800,
      moving: 3000,
      utilities: 40,
      transport: 0,
      start: ymString(addMonths(now, 3)),
    }),
    compile: (v, m, now) => {
      const s = startOf(v, now);
      const rentDelta = num(v, "rent") - m.H;
      const streams: Stream[] = [];
      if (rentDelta) streams.push({ label: m.H > 0 ? "Rent change vs today's bills" : "New rent", kind: "expense", amount: rentDelta, from: s });
      if (num(v, "utilities")) streams.push({ label: "Utility change", kind: "expense", amount: num(v, "utilities"), from: s });
      if (num(v, "transport")) streams.push({ label: "Transportation change", kind: "expense", amount: num(v, "transport"), from: s });
      const oneOffs: OneOff[] = num(v, "moving") ? [{ label: "Moving expenses", amount: -num(v, "moving"), at: s }] : [];
      return {
        start: s,
        streams,
        oneOffs,
        events: [],
        derived: [{ label: "Change in housing cost", value: rentDelta, unit: "monthly" }],
      };
    },
    decision: (v, m, now) =>
      `move to a new city with rent of ${cad(num(v, "rent"))} a month${m.H > 0 ? ` (you pay about ${cad(m.H)} in household bills today)` : ""}, in ${monthName(now, startOf(v, now))}`,
    words: { delay: "Savings from the move arrive late by", upside: "Share of expected savings", gain: "lower costs" },
  },
  {
    kind: "car",
    title: "What if I buy a car?",
    short: "Buy a car",
    blurb: "A down payment now, a loan payment, insurance and upkeep every month.",
    fields: [
      { key: "price", label: "Car price", kind: "money", min: 1000, max: 120000, step: 500 },
      { key: "down", label: "Down payment", kind: "money", min: 0, max: 120000, step: 250 },
      { key: "rate", label: "Financing rate (annual)", kind: "rate", min: 0, max: 20, step: 0.1 },
      { key: "term", label: "Loan term", kind: "months", min: 12, max: 96, step: 6 },
      { key: "insurance", label: "Insurance (per month)", kind: "monthly", min: 0, max: 800, step: 10 },
      { key: "maintenance", label: "Maintenance and fuel (per month)", kind: "monthly", min: 0, max: 1000, step: 10 },
      date("start", "Purchase date"),
    ],
    defaults: (_m, now) => ({ price: 28000, down: 4000, rate: 6.9, term: 60, insurance: 180, maintenance: 120, start: ymString(addMonths(now, 2)) }),
    compile: (v, _m, now) => {
      const s = startOf(v, now);
      const down = Math.min(num(v, "down"), num(v, "price"));
      const term = Math.max(1, Math.round(num(v, "term")));
      const pay = payment(num(v, "price") - down, num(v, "rate"), term);
      const streams: Stream[] = [];
      if (pay > 0) streams.push({ label: "Car loan payment", kind: "expense", amount: pay, from: s, to: s + term - 1 });
      if (num(v, "insurance")) streams.push({ label: "Car insurance", kind: "expense", amount: num(v, "insurance"), from: s });
      if (num(v, "maintenance")) streams.push({ label: "Maintenance and fuel", kind: "expense", amount: num(v, "maintenance"), from: s });
      return {
        start: s,
        streams,
        oneOffs: down ? [{ label: "Car down payment", amount: -down, at: s }] : [],
        events: pay > 0 ? [{ at: s + term, title: "Car loan paid off", detail: `The ${cad(pay)}/mo payment ends` }] : [],
        derived: [{ label: "Monthly financing payment (calculated)", value: pay, unit: "monthly" }],
      };
    },
    decision: (v, _m, now) => `buy a ${cad(num(v, "price"))} car with ${cad(Math.min(num(v, "down"), num(v, "price")))} down, in ${monthName(now, startOf(v, now))}`,
    words: { delay: "Gains arrive late by", upside: "Share of expected gains", gain: "savings" },
  },
  {
    kind: "house",
    title: "What if I buy a house?",
    short: "Buy a house",
    blurb: "Down payment and closing costs, then a mortgage instead of rent.",
    fields: [
      { key: "price", label: "Home price", kind: "money", min: 50000, max: 2000000, step: 5000 },
      { key: "down", label: "Down payment", kind: "money", min: 0, max: 1000000, step: 1000, hint: "Canada's minimum is 5% of the first $500K" },
      { key: "rate", label: "Mortgage rate (annual)", kind: "rate", min: 0, max: 12, step: 0.05 },
      { key: "years", label: "Amortization", kind: "years", min: 5, max: 30, step: 1 },
      { key: "closing", label: "Closing costs", kind: "money", min: 0, max: 60000, step: 250, hint: "Land transfer tax, legal fees, inspection" },
      { key: "ownership", label: "Property tax, insurance and upkeep (per month)", kind: "monthly", min: 0, max: 3000, step: 25 },
      { key: "rentSaved", label: "Rent and bills you stop paying (per month)", kind: "monthly", min: 0, max: 8000, step: 25 },
      date("start", "Purchase date"),
    ],
    defaults: (m, now) => ({
      price: 450000,
      down: 22500,
      rate: 4.5,
      years: 25,
      closing: 6500,
      ownership: 650,
      rentSaved: r50(m.H),
      start: ymString(addMonths(now, 6)),
    }),
    compile: (v, _m, now) => {
      const s = startOf(v, now);
      const down = Math.min(num(v, "down"), num(v, "price"));
      const pay = payment(num(v, "price") - down, num(v, "rate"), Math.max(1, num(v, "years")) * 12);
      const streams: Stream[] = [];
      if (pay > 0) streams.push({ label: "Mortgage payment", kind: "expense", amount: pay, from: s });
      if (num(v, "ownership")) streams.push({ label: "Property tax, insurance, upkeep", kind: "expense", amount: num(v, "ownership"), from: s });
      if (num(v, "rentSaved")) streams.push({ label: "Rent you stop paying", kind: "expense", amount: -num(v, "rentSaved"), from: s, certain: true });
      const oneOffs: OneOff[] = [];
      if (down) oneOffs.push({ label: "House down payment", amount: -down, at: s });
      if (num(v, "closing")) oneOffs.push({ label: "Closing costs", amount: -num(v, "closing"), at: s });
      return { start: s, streams, oneOffs, events: [], derived: [{ label: "Monthly mortgage payment (calculated)", value: pay, unit: "monthly" }] };
    },
    decision: (v, _m, now) =>
      `buy a ${cad(num(v, "price"))} home with ${cad(Math.min(num(v, "down"), num(v, "price")))} down, in ${monthName(now, startOf(v, now))}`,
    words: { delay: "Gains arrive late by", upside: "Share of expected gains", gain: "savings" },
  },
  {
    kind: "school",
    title: "What if I go back to school?",
    short: "Back to school",
    blurb: "Tuition and fewer work hours now, for a better paycheque later.",
    fields: [
      { key: "tuition", label: "Tuition per year", kind: "money", min: 0, max: 60000, step: 250, hint: "Paid at the start of each school year" },
      { key: "length", label: "Program length", kind: "months", min: 3, max: 48, step: 1 },
      { key: "keep", label: "Earnings you keep while studying", kind: "pct", min: 0, max: 100, step: 5, hint: "Part-time work, as a share of your usual earnings" },
      { key: "books", label: "Books, laptop and supplies", kind: "money", min: 0, max: 10000, step: 50 },
      { key: "gradSalary", label: "Expected monthly pay after graduating", kind: "monthly", min: 0, max: 30000, step: 50 },
      date("start", "Program start date"),
    ],
    defaults: (m, now) => ({
      tuition: 7500,
      length: 16,
      keep: 40,
      books: 1200,
      gradSalary: earnings(m) > 0 ? r50(earnings(m) * 1.25) : 4500,
      start: ymString(addMonths(now, (9 - now.m + 12) % 12 || 12)), // next September
    }),
    compile: (v, m, now) => {
      const s = startOf(v, now);
      const len = Math.max(1, Math.round(num(v, "length")));
      const keep = Math.min(100, Math.max(0, num(v, "keep"))) / 100;
      const streams: Stream[] = [];
      if (earnings(m) > 0 && keep < 1)
        streams.push({ label: "Fewer work hours while studying", kind: "income", amount: -(1 - keep) * earnings(m), from: s, to: s + len - 1, certain: true });
      const raise = num(v, "gradSalary") - earnings(m);
      if (raise) streams.push({ label: "Graduate pay", kind: "income", amount: raise, from: s + len });
      const oneOffs: OneOff[] = [];
      for (let y = 0; y * 12 < len; y++)
        if (num(v, "tuition")) oneOffs.push({ label: `Tuition, year ${y + 1}`, amount: -num(v, "tuition"), at: s + y * 12 });
      if (num(v, "books")) oneOffs.push({ label: "Books and supplies", amount: -num(v, "books"), at: s });
      return {
        start: s,
        streams,
        oneOffs,
        events: [{ at: s + len, title: "Graduation", detail: `Program ends after ${len} months` }],
        derived: [{ label: "Pay change after graduating", value: raise, unit: "monthly" }],
      };
    },
    decision: (v, _m, now) =>
      `go back to school for ${Math.round(num(v, "length"))} months from ${monthName(now, startOf(v, now))}, aiming for ${cad(num(v, "gradSalary"))} a month after`,
    words: { delay: "Job search after graduating (months)", upside: "Share of expected graduate pay", gain: "graduate pay" },
    bad: { delayMonths: 4 },
  },
  {
    kind: "side",
    title: "What if I start a side hustle?",
    short: "Side hustle",
    blurb: "Startup costs first, extra income as it grows.",
    fields: [
      { key: "income", label: "Expected side income (per month)", kind: "monthly", min: 0, max: 15000, step: 50 },
      { key: "costs", label: "Running costs (per month)", kind: "monthly", min: 0, max: 5000, step: 25, hint: "Supplies, software, fees" },
      { key: "startup", label: "Startup costs", kind: "money", min: 0, max: 30000, step: 100 },
      { key: "ramp", label: "Months to reach full income", kind: "months", min: 1, max: 24, step: 1 },
      date("start", "Launch date"),
    ],
    defaults: (_m, now) => ({ income: 900, costs: 150, startup: 1200, ramp: 4, start: ymString(addMonths(now, 1)) }),
    compile: (v, _m, now) => {
      const s = startOf(v, now);
      const streams: Stream[] = [];
      if (num(v, "income"))
        streams.push({ label: "Side income", kind: "income", amount: num(v, "income"), from: s, rampMonths: Math.max(1, num(v, "ramp")) });
      if (num(v, "costs")) streams.push({ label: "Side hustle running costs", kind: "expense", amount: num(v, "costs"), from: s });
      return {
        start: s,
        streams,
        oneOffs: num(v, "startup") ? [{ label: "Startup costs", amount: -num(v, "startup"), at: s }] : [],
        events: [],
        derived: [{ label: "Net side income at full speed", value: num(v, "income") - num(v, "costs"), unit: "monthly" }],
      };
    },
    decision: (v, _m, now) =>
      `start a side hustle in ${monthName(now, startOf(v, now))} that could bring in ${cad(num(v, "income"))} a month once it gets going`,
    words: { delay: "Side hustle takes off late by", upside: "Share of expected side income", gain: "side income" },
    bad: { delayMonths: 3, upsidePct: 50 },
  },
  {
    kind: "save",
    title: "What if I increase my savings?",
    short: "Save more",
    blurb: "Pay yourself first, every month.",
    fields: [
      { key: "amount", label: "Extra saved each month", kind: "monthly", min: 0, max: 10000, step: 25, hint: "Moved to savings on payday, so it never gets spent" },
      { key: "lump", label: "One-time deposit (tax refund, bonus)", kind: "money", min: 0, max: 50000, step: 100 },
      date("start", "Start date"),
    ],
    defaults: (m, now) => ({ amount: r50(Math.max(100, 0.08 * m.I)), lump: 0, start: ymString(addMonths(now, 1)) }),
    compile: (v, _m, now) => {
      const s = startOf(v, now);
      return {
        start: s,
        streams: num(v, "amount") ? [{ label: "Spending moved into savings", kind: "expense", amount: -num(v, "amount"), from: s }] : [],
        oneOffs: num(v, "lump") ? [{ label: "One-time deposit", amount: num(v, "lump"), at: s }] : [],
        events: [],
        derived: [],
      };
    },
    decision: (v, _m, now) => `save an extra ${cad(num(v, "amount"))} every month from ${monthName(now, startOf(v, now))}`,
    words: { delay: "Months before the habit sticks", upside: "Share of the plan you keep up", gain: "extra savings" },
    bad: { delayMonths: 1, upsidePct: 60 },
  },
  {
    kind: "spend",
    title: "What if I change my spending habits?",
    short: "Spend smarter",
    blurb: "Trim flexible spending and recurring bills.",
    fields: [
      { key: "flexCut", label: "Cut flexible spending by", kind: "pct", min: 0, max: 60, step: 1, hint: "Card and cash spending plus other transfers out" },
      { key: "subs", label: "Cancel subscriptions and recurring costs (per month)", kind: "monthly", min: 0, max: 1000, step: 5 },
      { key: "billsCut", label: "Lower household bills by (switch providers)", kind: "pct", min: 0, max: 40, step: 1 },
      { key: "changeCost", label: "One-time cost to make the change", kind: "money", min: 0, max: 5000, step: 25, hint: "e.g. an efficient appliance, cancellation fees" },
      date("start", "Start date"),
    ],
    defaults: (_m, now) => ({ flexCut: 15, subs: 40, billsCut: 0, changeCost: 0, start: ymString(addMonths(now, 1)) }),
    compile: (v, m, now) => {
      const s = startOf(v, now);
      const flex = (num(v, "flexCut") / 100) * m.disc;
      const bills = (num(v, "billsCut") / 100) * m.H;
      const streams: Stream[] = [];
      if (flex) streams.push({ label: "Less flexible spending", kind: "expense", amount: -flex, from: s });
      if (num(v, "subs")) streams.push({ label: "Subscriptions cancelled", kind: "expense", amount: -num(v, "subs"), from: s });
      if (bills) streams.push({ label: "Lower household bills", kind: "expense", amount: -bills, from: s });
      return {
        start: s,
        streams,
        oneOffs: num(v, "changeCost") ? [{ label: "Cost of the change", amount: -num(v, "changeCost"), at: s }] : [],
        events: [],
        derived: [{ label: "Planned monthly saving", value: flex + num(v, "subs") + bills, unit: "monthly" }],
      };
    },
    decision: (v, m, now) =>
      `cut flexible spending by ${num(v, "flexCut")}% (about ${cad((num(v, "flexCut") / 100) * m.disc)} of your ${cad(m.disc)} a month)${
        num(v, "subs") ? ` and drop ${cad(num(v, "subs"))} of subscriptions` : ""
      }, from ${monthName(now, startOf(v, now))}`,
    words: { delay: "Months before the new habits stick", upside: "Share of the cuts you keep up", gain: "spending cuts" },
    bad: { delayMonths: 1, upsidePct: 60 },
  },
  {
    kind: "custom",
    title: "Custom What If",
    short: "Custom",
    blurb: "Describe any decision in your own numbers.",
    fields: [
      { key: "name", label: "What if I…", kind: "text" },
      { key: "incomeChange", label: "Change in monthly income", kind: "monthlySigned", min: -20000, max: 20000, step: 50 },
      { key: "expenseChange", label: "Change in monthly expenses", kind: "monthlySigned", min: -10000, max: 10000, step: 25 },
      { key: "oneOffCost", label: "One-time cost", kind: "money", min: 0, max: 100000, step: 100 },
      { key: "oneOffIncome", label: "One-time money in", kind: "money", min: 0, max: 100000, step: 100 },
      { key: "duration", label: "How long the monthly changes last (0 = ongoing)", kind: "months", min: 0, max: 60, step: 1 },
      date("start", "Start date"),
    ],
    defaults: (_m, now) => ({
      name: "take a year-long contract abroad",
      incomeChange: 600,
      expenseChange: 300,
      oneOffCost: 2000,
      oneOffIncome: 0,
      duration: 12,
      start: ymString(addMonths(now, 2)),
    }),
    compile: (v, _m, now) => {
      const s = startOf(v, now);
      const d = Math.round(num(v, "duration"));
      const to = d > 0 ? s + d - 1 : undefined;
      const streams: Stream[] = [];
      if (num(v, "incomeChange")) streams.push({ label: "Income change", kind: "income", amount: num(v, "incomeChange"), from: s, to });
      if (num(v, "expenseChange")) streams.push({ label: "Expense change", kind: "expense", amount: num(v, "expenseChange"), from: s, to });
      const oneOffs: OneOff[] = [];
      if (num(v, "oneOffCost")) oneOffs.push({ label: "One-time cost", amount: -num(v, "oneOffCost"), at: s });
      if (num(v, "oneOffIncome")) oneOffs.push({ label: "One-time money in", amount: num(v, "oneOffIncome"), at: s });
      return { start: s, streams, oneOffs, events: to ? [{ at: to + 1, title: "Changes end", detail: `After ${d} months` }] : [], derived: [] };
    },
    decision: (v, _m, now) => `${String(v.name || "make a change").replace(/^i\s+/i, "")}, from ${monthName(now, startOf(v, now))}`,
    words: { delay: "Gains arrive late by", upside: "Share of expected gains", gain: "gains" },
  },
];

export const SCENARIO_BY_KIND = Object.fromEntries(SCENARIOS.map((s) => [s.kind, s])) as Record<ScenarioKind, ScenarioDef>;

export function badDefaults(kind: ScenarioKind): Assumptions {
  return { ...BAD_DEFAULT, ...SCENARIO_BY_KIND[kind].bad };
}
