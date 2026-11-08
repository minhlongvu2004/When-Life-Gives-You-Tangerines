// Deterministic month-by-month simulator for the What If page.
//
// Start: the customer's own numbers from the bank data (I, S, B, P from metrics.json).
// Each month: income = I + scenario income changes; spending = S (+ inflation) + scenario expense changes;
// one-off amounts land in their month; the balance carries forward.
// Goals share ONE pot of savings: each month the balance is handed out in priority order
// (high → low, then earliest target date), so no dollar is ever counted toward two goals.
// "Purchase" goals (car, vacation, paying off a loan…) are spent the month they are fully funded.

import type { Metrics } from "../engine";
import { addMonths, offsetOf, type Assumptions, type Compiled, type OneOff, type Stream, type YM } from "./scenarios";

export const MAX_MONTHS = 60;
export const HORIZONS = [3, 6, 12, 24, 36] as const;
export type Horizon = (typeof HORIZONS)[number];

export type Priority = "high" | "medium" | "low";
export type GoalTemplate = "emergency" | "car" | "house" | "loan" | "education" | "vacation" | "custom";

export interface Goal {
  id: string;
  template: GoalTemplate;
  name: string;
  target: number;
  targetDate: string; // YYYY-MM
  priority: Priority;
  spend: boolean; // true = money is spent when the goal is reached (a purchase); false = kept as savings
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function orderGoals(goals: Goal[]): Goal[] {
  return goals
    .map((g, i) => ({ g, i }))
    .sort((a, b) => PRIORITY_RANK[a.g.priority] - PRIORITY_RANK[b.g.priority] || a.g.targetDate.localeCompare(b.g.targetDate) || a.i - b.i)
    .map((x) => x.g);
}

export interface SimInput {
  m: Metrics;
  compiled: Compiled;
  a: Assumptions;
  goals: Goal[];
  now: YM;
  /** Month offset of the existing loan's last payment (from loans.csv), or null if unknown / no loan. */
  loanEndsAt: number | null;
  /** Extra certain changes, used to test what-if levers for the guidance. */
  levers?: Stream[];
}

export interface Point {
  t: number;
  income: number;
  expenses: number;
  net: number; // income − expenses
  oneOff: number; // one-time amounts this month (+ in, − out), goal purchases excluded
  purchases: number; // goal purchases this month
  balance: number; // end-of-month savings after everything
  earmarked: number; // part of the balance held for savings goals
  goals: Record<string, number>; // funded amount per goal
}

export interface GoalOutcome {
  goal: Goal;
  reachedAt: number | null; // month the goal was fully funded (and bought, for purchases); null = not within MAX_MONTHS
  targetAt: number; // month offset of the target date
}

export interface Future {
  input: SimInput;
  streams: Stream[];
  oneOffs: OneOff[];
  points: Point[]; // index = month, 0..MAX_MONTHS
  goals: GoalOutcome[];
  loanPaidAt: number | null;
}

/** Apply a future's assumptions to the scenario's money streams. */
export function applyAssumptions(c: Compiled, a: Assumptions): { streams: Stream[]; oneOffs: OneOff[] } {
  const up = a.upsidePct / 100;
  const streams = c.streams.map((s): Stream => {
    if (s.certain) return s;
    const effect = s.kind === "income" ? s.amount : -s.amount;
    if (effect > 0)
      return { ...s, amount: s.amount * up, from: s.from + a.delayMonths, to: s.to === undefined ? undefined : s.to + a.delayMonths };
    return { ...s, amount: s.amount * (a.expensePct / 100) };
  });
  const oneOffs = c.oneOffs.map((o): OneOff => {
    if (o.certain) return o;
    return o.amount < 0 ? { ...o, amount: o.amount * (a.costPct / 100) } : { ...o, amount: o.amount * up, at: o.at + a.delayMonths };
  });
  return { streams, oneOffs };
}

export function streamAt(s: Stream, t: number): number {
  if (t < s.from || (s.to !== undefined && t > s.to)) return 0;
  const ramp = s.rampMonths && s.rampMonths > 1 ? Math.min(1, (t - s.from + 1) / s.rampMonths) : 1;
  return s.amount * ramp;
}

export function simulate(input: SimInput): Future {
  const { m, a, now, loanEndsAt } = input;
  const applied = applyAssumptions(input.compiled, a);
  const streams = [...applied.streams, ...(input.levers ?? [])];
  const oneOffs = applied.oneOffs;
  const order = orderGoals(input.goals.filter((g) => g.target > 0));
  const reachedAt: Record<string, number | null> = {};
  const spentAt: Record<string, number> = {};
  for (const g of order) reachedAt[g.id] = null;
  let loanPaidAt: number | null = null;
  const hasLoan = m.P > 0;
  const loanActive = (t: number) => hasLoan && !(loanEndsAt !== null && t > loanEndsAt) && !(loanPaidAt !== null && t > loanPaidAt);
  const everyday = Math.max(0, m.S - (hasLoan ? m.P : 0)); // spending other than the loan payment

  let bal = m.B;
  const points: Point[] = [];

  const allocate = (t: number) => {
    let avail = Math.max(0, bal);
    let purchases = 0;
    const funded: Record<string, number> = {};
    let earmarked = 0;
    for (const g of order) {
      if (spentAt[g.id] !== undefined) {
        funded[g.id] = g.target;
        continue;
      }
      const x = Math.min(g.target, avail);
      avail -= x;
      funded[g.id] = x;
      const full = x >= g.target - 0.005;
      if (full && g.spend && t >= 1) {
        spentAt[g.id] = t;
        reachedAt[g.id] = t;
        bal -= g.target;
        purchases -= g.target;
        if (g.template === "loan" && loanActive(t)) loanPaidAt = t;
      } else {
        if (full && !g.spend && reachedAt[g.id] === null) reachedAt[g.id] = t;
        if (!g.spend) earmarked += x;
      }
    }
    return { funded, earmarked, purchases };
  };

  const a0 = allocate(0);
  points.push({ t: 0, income: m.I, expenses: m.S, net: m.I - m.S, oneOff: 0, purchases: 0, balance: bal, earmarked: a0.earmarked, goals: a0.funded });

  for (let t = 1; t <= MAX_MONTHS; t++) {
    const infl = Math.pow(1 + a.inflationPct / 100, t / 12);
    let income = m.I;
    let expenses = everyday * infl + (loanActive(t) ? m.P : 0);
    for (const s of streams) {
      const v = streamAt(s, t);
      if (s.kind === "income") income += v;
      else expenses += v;
    }
    income = Math.max(0, income);
    expenses = Math.max(0, expenses);
    const oneOff = oneOffs.filter((o) => o.at === t).reduce((x, o) => x + o.amount, 0);
    bal += income - expenses + oneOff;
    const al = allocate(t);
    points.push({ t, income, expenses, net: income - expenses, oneOff, purchases: al.purchases, balance: bal, earmarked: al.earmarked, goals: al.funded });
  }

  return {
    input,
    streams,
    oneOffs,
    points,
    goals: input.goals.map((g) => ({ goal: g, reachedAt: g.target > 0 ? reachedAt[g.id] : 0, targetAt: offsetOf(now, g.targetDate) })),
    loanPaidAt,
  };
}

/* ------------------------------------------------------------------ reading a future at a horizon */

export interface Summary {
  h: number;
  income: number;
  expenses: number;
  net: number;
  avgNet: number;
  balance: number;
  start: number;
  bufferMonths: number; // savings ÷ monthly spending at the horizon
  low: { t: number; balance: number };
  firstNegative: number | null;
  negativeMonths: number;
  oneOffTotal: number;
  /**
   * reachedByH: purchase goals = paid for by the horizon; savings goals = fully funded AT the horizon
   * (a savings goal that filled up and was later drawn down by costs is not counted as reached).
   */
  goals: { outcome: GoalOutcome; funded: number; progress: number; reachedByH: boolean; dipped: boolean; onTime: boolean }[];
}

export function summarize(f: Future, h: number): Summary {
  const pts = f.points.slice(1, h + 1);
  const end = f.points[h];
  let low = { t: 0, balance: f.points[0].balance };
  for (const p of pts) if (p.balance < low.balance) low = { t: p.t, balance: p.balance };
  const neg = pts.filter((p) => p.balance < 0);
  return {
    h,
    income: end.income,
    expenses: end.expenses,
    net: end.net,
    avgNet: pts.reduce((x, p) => x + p.net, 0) / Math.max(1, pts.length),
    balance: end.balance,
    start: f.points[0].balance,
    bufferMonths: end.expenses > 0 ? end.balance / end.expenses : end.balance > 0 ? Infinity : 0,
    low,
    firstNegative: neg.length ? neg[0].t : null,
    negativeMonths: neg.length,
    oneOffTotal: pts.reduce((x, p) => x + p.oneOff, 0),
    goals: f.goals.map((o) => {
      const funded = end.goals[o.goal.id] ?? 0;
      const ever = o.reachedAt !== null && o.reachedAt <= h;
      const full = o.goal.target <= 0 || funded >= o.goal.target - 0.005;
      const reachedByH = o.goal.spend ? ever : full;
      return {
        outcome: o,
        funded,
        progress: o.goal.target > 0 ? (reachedByH ? 1 : Math.min(1, funded / o.goal.target)) : 1,
        reachedByH,
        dipped: !o.goal.spend && ever && !full,
        onTime: o.reachedAt !== null && o.reachedAt <= o.targetAt,
      };
    }),
  };
}

/* ------------------------------------------------------------------ milestones */

export type MilestoneKind = "decision" | "cost" | "income" | "event" | "negative" | "recover" | "low" | "goal" | "cushion" | "loan";
export interface Milestone {
  t: number;
  kind: MilestoneKind;
  tone: "good" | "bad" | "neutral";
  title: string;
  detail: string;
  say: string; // the same event as a story clause: "you pay for Vacation ($4,000), on time"
}

const $ = (x: number) => `${x < 0 ? "−" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-CA")}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function milestones(f: Future, h: number, decisionTitle: string): Milestone[] {
  const out: Milestone[] = [];
  const c = f.input.compiled;
  const pts = f.points;
  out.push({ t: c.start, kind: "decision", tone: "neutral", title: decisionTitle, detail: "The decision takes effect", say: "the decision takes effect" });
  for (const o of f.oneOffs) {
    const amt = $(Math.abs(o.amount));
    out.push({
      t: o.at,
      kind: "cost",
      tone: o.amount < 0 ? "bad" : "good",
      title: o.label,
      detail: `${o.amount < 0 ? "Pays" : "Receives"} ${amt} once`,
      say: o.amount < 0 ? `you pay ${amt} for ${lower(o.label)}` : `${lower(o.label)} brings in ${amt}`,
    });
  }
  for (const s of f.streams) {
    const effect = s.kind === "income" ? s.amount : -s.amount;
    if (Math.abs(effect) < 1 || s.from < 1) continue;
    if (f.input.levers?.includes(s)) continue;
    const amt = `${effect > 0 ? "+" : "−"}${$(Math.abs(effect))}/mo`;
    const ramp = s.rampMonths && s.rampMonths > 1 ? ` once fully ramped up (${s.rampMonths} months)` : "";
    const title = /stop/i.test(s.label) ? s.label : `${s.label} starts`;
    out.push({ t: s.from, kind: "income", tone: effect > 0 ? "good" : "bad", title, detail: `${amt}${ramp}`, say: `${lower(title)} (${amt}${ramp})` });
  }
  for (const e of c.events) out.push({ t: e.at, kind: "event", tone: "neutral", title: e.title, detail: e.detail, say: `${lower(e.title)}: ${lower(e.detail)}` });
  const le = f.input.loanEndsAt;
  if (f.input.m.P > 0 && le !== null && le >= 1 && (f.loanPaidAt === null || le < f.loanPaidAt)) {
    const P = $(f.input.m.P);
    out.push({
      t: le + 1,
      kind: "loan",
      tone: "good",
      title: "Existing loan paid off",
      detail: `${P}/mo payment ends (from your loan record)`,
      say: `your existing loan is paid off, freeing ${P} a month`,
    });
  }
  for (const g of f.goals)
    if (g.reachedAt !== null && g.reachedAt >= 1) {
      const when = g.reachedAt <= g.targetAt ? "on time" : `${g.reachedAt - g.targetAt} months after the target date`;
      out.push({
        t: g.reachedAt,
        kind: "goal",
        tone: "good",
        title: g.goal.spend ? `${g.goal.name} paid for` : `${g.goal.name} fully saved`,
        detail: `${$(g.goal.target)}, ${when}`,
        say: g.goal.spend
          ? `you pay for ${g.goal.name} (${$(g.goal.target)}), ${when}`
          : `you reach your ${g.goal.name} goal of ${$(g.goal.target)}, ${when}`,
      });
    }
  let wasNeg = pts[0].balance < 0;
  for (let t = 1; t <= MAX_MONTHS; t++) {
    const neg = pts[t].balance < 0;
    const b = $(pts[t].balance);
    if (neg && !wasNeg)
      out.push({ t, kind: "negative", tone: "bad", title: "Savings run out", detail: `Balance falls to ${b}`, say: `your savings run out (balance ${b})` });
    if (!neg && wasNeg)
      out.push({ t, kind: "recover", tone: "good", title: "Back above zero", detail: `Balance recovers to ${b}`, say: `your savings climb back above zero (${b})` });
    wasNeg = neg;
  }
  const cushionAt = pts.findIndex((p, t) => t >= 1 && p.expenses > 0 && p.balance >= 3 * p.expenses);
  if (cushionAt >= 1 && !(pts[0].balance >= 3 * pts[0].expenses)) {
    const x = $(3 * pts[cushionAt].expenses);
    out.push({
      t: cushionAt,
      kind: "cushion",
      tone: "good",
      title: "3-month safety cushion",
      detail: `Savings cover 3 months of spending (${x})`,
      say: `your savings reach a 3-month safety cushion (${x})`,
    });
  }
  const s = summarize(f, h);
  if (s.low.t >= 1 && s.low.balance < s.start && !out.some((x) => x.t === s.low.t && x.kind === "negative")) {
    const b = $(s.low.balance);
    out.push({
      t: s.low.t,
      kind: "low",
      tone: s.low.balance < 0 ? "bad" : "neutral",
      title: "Lowest point",
      detail: `Savings bottom out at ${b}`,
      say: `your savings hit their lowest point, ${b}`,
    });
  }
  return out.filter((x) => x.t >= 1 && x.t <= h).sort((a, b) => a.t - b.t || rank(a.kind) - rank(b.kind));
}
const rank = (k: MilestoneKind) => ["decision", "cost", "income", "event", "loan", "negative", "low", "recover", "cushion", "goal"].indexOf(k);

/* ------------------------------------------------------------------ levers used by the guidance */

/** Smallest extra monthly saving (from next month) that gets the goal funded by its target date. null = not possible. */
export function extraNeeded(input: SimInput, goalId: string): number | null {
  const reach = (x: number) => {
    const f = simulate({ ...input, levers: [...(input.levers ?? []), { label: "Extra saving", kind: "expense", amount: -x, from: 1, certain: true }] });
    const o = f.goals.find((g) => g.goal.id === goalId);
    return o && o.reachedAt !== null && o.reachedAt <= o.targetAt;
  };
  const g = input.goals.find((x) => x.id === goalId);
  if (!g) return null;
  const targetAt = offsetOf(input.now, g.targetDate);
  if (targetAt < 1) return null;
  if (reach(0)) return 0;
  // upper bound: enough to fund every goal and every cost within a single month
  const sum = (xs: number[]) => xs.reduce((x, y) => x + Math.abs(y), 0);
  let hi =
    100 +
    sum(input.goals.map((x) => x.target)) +
    sum(input.compiled.oneOffs.map((o) => o.amount)) * 2 +
    2 * (input.m.S + sum(input.compiled.streams.map((s) => s.amount))) +
    Math.max(0, -input.m.B);
  if (!reach(hi)) return null;
  let lo = 0;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 5) * 5;
}

export function loanEndOffset(now: YM, loan: { start: string; months: number } | null | undefined): number | null {
  if (!loan) return null;
  const [y, mo] = loan.start.split("-").map(Number);
  if (!y || !mo) return null;
  const last = addMonths({ y, m: mo }, loan.months); // first payment the month after the loan is granted
  return last.y * 12 + last.m - (now.y * 12 + now.m);
}
