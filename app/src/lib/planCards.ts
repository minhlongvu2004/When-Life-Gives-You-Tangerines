// The three cards on step 3 (Do nothing / Short term / Long term), as data.
// Every number comes from the judges' runway formula via scenario(); StepPlan only renders this.

import { BACKUP_TRIM, goalPlan, money, NO_SHOCK, scenario, type Metrics, type Mode, type Shock } from "./engine";
import { isShock } from "./shocks";

/** Today's StepPlan default when no twist was picked: a layoff on 55% EI for 6 months. */
export const DEFAULT_PLAN_SHOCK: Shock = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };
export const effectiveShock = (s: Shock): Shock => (isShock(s) ? s : DEFAULT_PLAN_SHOCK);

export const LEAN_CUT_MIN = 0.1;
export const LEAN_CUT_MAX = 0.5;

/** Share of flexible spending to cut: back to the customer's own lean month, kept between 10% and 50%. */
export function leanCut(m: Metrics): number {
  if (m.disc <= 0) return 0;
  return Math.min(LEAN_CUT_MAX, Math.max(LEAN_CUT_MIN, 1 - m.lean / m.disc));
}

/** Fund sizes: $57.3K. Small amounts stay whole dollars. */
export const compact = (x: number) => (x >= 1000 ? `$${(x / 1000).toFixed(1)}K` : money(x));

export type CardState = "ok" | "mid" | "bad" | "blocked";
export type ActionIcon = "cut" | "loan" | "save" | "trim" | "receipt" | "card";
export interface CardAction {
  icon: ActionIcon;
  text: string; // "{amount}" marks where the highlighted amount goes
  amount?: string;
}
export interface PlanCard {
  timing: string;
  timingNote?: string;
  actions: CardAction[];
  empty?: string;
  runway: number | null | undefined; // undefined = blocked ("Can't save yet")
  state: CardState;
  pill?: string;
}
export interface PlanCards {
  durationMonths: number;
  income: number;
  incomeNote: string;
  oneOff: number;
  nothing: PlanCard;
  short: PlanCard;
  long: PlanCard;
  facts: {
    safe: boolean;
    wiped: boolean;
    capped: boolean;
    leanCut: number;
    fund: ReturnType<typeof goalPlan>;
    save: number;
    whenMonths: number | null;
    useFast: boolean;
    longState: "funded" | "blocked" | "saving";
  };
}

/** State and pill for a runway against the shock's duration. Never a green pill. */
function grade(runway: number | null, dur: number, wiped = false): Pick<PlanCard, "state" | "pill"> {
  if (wiped) return { state: "bad", pill: "Can't cover the bill" };
  if (runway === null || runway >= dur) return { state: "ok" };
  return { state: runway >= dur * 0.5 ? "mid" : "bad", pill: `${(dur - runway).toFixed(1)} months short` };
}

export function planCards(m: Metrics, shock: Shock, mode: Mode): PlanCards {
  const dur = shock.durationMonths;
  const base = scenario(m, shock, mode);
  const oneOff = base.oneOff;
  const wiped = oneOff > 0 && base.bufferLeft <= 0;
  const safe = !wiped && (base.runway === null || base.runway >= dur);
  const cut = leanCut(m);
  const capped = m.disc > 0 && 1 - m.lean / m.disc > LEAN_CUT_MAX;
  const ongoing = shock.incomePct < 1 || shock.jobLoss || shock.billsPct !== 0 || shock.extraMonthly > 0;

  const nothing: PlanCard = {
    timing: "Hits today",
    actions: [],
    empty: "Nothing. Spending stays the same.",
    runway: base.runway,
    ...grade(base.runway, dur, wiped),
  };

  // ---- Short term: one plan, every lever at once ----
  const cutActions: CardAction[] = [];
  if (m.P > 0) cutActions.push({ icon: "loan", text: "Pause the {amount} loan payment", amount: money(m.P) });
  if (m.disc > 0)
    cutActions.push({ icon: "cut", text: "Cut card & cash spending to {amount}/mo", amount: money(m.disc * (1 - cut)) });
  const levers = { discCut: m.disc > 0 ? cut : 0, pauseLoan: m.P > 0 };
  let short: PlanCard;
  if (safe) {
    short = {
      timing: "Hits today",
      timingNote: "no cuts needed",
      actions: [],
      empty: `Nothing to do. Their savings already outlast the ${dur} months.`,
      runway: base.runway,
      ...grade(base.runway, dur),
    };
  } else if (wiped) {
    const spreadShock = { ...shock, oneOffMult: 0, oneOffAbs: 0, extraMonthly: shock.extraMonthly + oneOff / 12 };
    const runway = scenario(m, spreadShock, mode, ongoing ? levers : undefined).runway;
    short = {
      timing: "Hits today",
      timingNote: "they act fast",
      actions: [
        { icon: "receipt", text: "Spread the bill over a {amount}", amount: "12-month plan" },
        { icon: "card", text: "Pay {amount} a month", amount: money(oneOff / 12) },
        ...(ongoing ? cutActions : []),
      ],
      runway,
      ...grade(runway, dur),
    };
  } else {
    const runway = scenario(m, shock, mode, levers).runway;
    short = {
      timing: "Hits today",
      timingNote: "they act fast",
      actions: cutActions,
      empty: cutActions.length ? undefined : "No flexible spending or loan payment to cut.",
      runway,
      ...grade(runway, dur),
    };
  }

  // ---- Long term: build the emergency fund first, then the shock hits ----
  const g = goalPlan(m, mode, 0.5);
  const useFast = g.fastMonths !== null && (g.monthsToGoal === null || g.monthsToGoal > 18) && g.fastMonths < (g.monthsToGoal ?? Infinity);
  const save = useFast ? g.fastMonthly : g.monthly;
  const when = useFast ? g.fastMonths : g.monthsToGoal;
  const longState = g.shortfall === 0 ? "funded" : when === null || when > 60 ? "blocked" : "saving";
  let long: PlanCard;
  if (longState === "funded") {
    long = {
      timing: "Already ready",
      timingNote: "fund in place",
      actions: [],
      empty: `Nothing to do. Their ${money(m.B)} already covers the ${compact(g.target)} emergency fund.`,
      runway: base.runway,
      ...grade(base.runway, dur),
    };
  } else if (longState === "blocked") {
    long = {
      timing: "Hits later",
      timingNote: "after saving",
      actions: [],
      empty:
        g.surplus < 0
          ? `They spend ${money(-g.surplus)} a month more than they earn. Fix that first.`
          : "At today's surplus, the fund is more than 5 years away.",
      runway: undefined,
      state: "blocked",
    };
  } else {
    const runway = scenario({ ...m, B: Math.max(m.B, g.target) }, shock, mode).runway;
    long = {
      timing: `Hits in ${when} months`,
      timingNote: "they saved first",
      actions: [
        { icon: "save", text: "Auto-save {amount} every payday", amount: money(save) },
        ...(useFast ? [{ icon: "trim" as const, text: "Trim card & cash spending {amount}", amount: `${Math.round(BACKUP_TRIM * 100)}%` }] : []),
      ],
      runway,
      ...grade(runway, dur),
    };
  }

  return {
    durationMonths: dur,
    income: base.income,
    incomeNote: base.incomeNote,
    oneOff,
    nothing,
    short,
    long,
    facts: { safe, wiped, capped, leanCut: cut, fund: g, save, whenMonths: when, useFast, longState },
  };
}
