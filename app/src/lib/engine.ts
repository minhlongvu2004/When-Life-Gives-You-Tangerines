// Resilience engine. Runway arithmetic mirrors pipeline/engine_ref.py operation-for-operation so the
// numbers match the judges' worked answers to one decimal (verified by src/lib/engine.test.ts).

export type Mode = "judge" | "realistic";

export interface Metrics {
  id: number;
  I: number; // typical monthly money in (median money_in)
  F: number; // typical fixed costs (median of bills + insurance + loan payments)
  S: number; // typical monthly spending (median money_out)
  B: number; // buffer (mean avg_daily_balance, last 6 months)
  H: number; // household bills (median)
  P: number; // loan payment if loan still running at end of 2025
  ins: number;
  loanPay: number;
  disc: number; // discretionary spending: card + genuine cash withdrawals + unlabelled transfers out (median)
  card: number;
  cash: number;
  xfer: number;
  fees: number;
  pension: number;
  nonPensionI: number;
  region: string;
  incomeCV: number | null;
  months: number;
}

export interface Shock {
  incomePct: number; // income after shock as share of usual (0.55 = EI)
  jobLoss: boolean; // is the income drop a job loss (EI cap applies in realistic mode)
  billsPct: number; // household bills increase, as share of H
  extraMonthly: number; // any extra monthly cost in $ (rent increase, childcare…)
  oneOffMult: number; // one-off cost as multiple of typical monthly spending S
  oneOffAbs: number; // one-off cost in $
  durationMonths: number; // how long the shock lasts (e.g. EI 6 months) — for the verdict
}

export interface Levers {
  discCut: number; // share of discretionary spending cut (0..1)
  pauseLoan: boolean; // loan payment paused / deferred
}

export const NO_SHOCK: Shock = {
  incomePct: 1,
  jobLoss: false,
  billsPct: 0,
  extraMonthly: 0,
  oneOffMult: 0,
  oneOffAbs: 0,
  durationMonths: 6,
};
export const NO_LEVERS: Levers = { discCut: 0, pauseLoan: false };

export const EI_RATE = 0.55;
export const EI_WEEKLY_MAX = 729; // 2026, canada.ca
export const EI_MONTHLY_CAP = (EI_WEEKLY_MAX * 52) / 12;
export const RUNWAY_CAP = 120;

/** Python's round(x, 1) for non-negative finite x: correctly rounded, exact ties go to even. */
export function pyRound1(x: number): number {
  const t = x * 4;
  if (Number.isInteger(t) && !Number.isInteger(x * 2)) {
    // exact tie (x = k.25 or k.75): round half to even
    const tenths = Math.floor(x * 10);
    return (tenths % 2 === 0 ? tenths : tenths + 1) / 10;
  }
  return Number(x.toFixed(1));
}

/** The judges' runway formula. Returns months, or null for "no shortfall (120+)". */
export function runway(B: number, oneOffCosts: number, spendingAfter: number, incomeAfter: number): number | null {
  const bufferLeft = B - oneOffCosts;
  const gap = spendingAfter - incomeAfter;
  if (bufferLeft <= 0) return 0;
  if (gap <= 0) return null;
  return pyRound1(Math.min(bufferLeft / gap, RUNWAY_CAP));
}

export function formatRunway(r: number | null): string {
  return r === null ? "no shortfall (120+)" : r.toFixed(1);
}

export interface Scenario {
  income: number;
  spending: number;
  oneOff: number;
  bufferLeft: number;
  gap: number;
  runway: number | null;
  /** parts, for "show the math" */
  incomeNote: string;
  spendingNote: string;
}

export function incomeAfter(m: Metrics, s: Shock, mode: Mode): { value: number; note: string } {
  if (s.incomePct === 1 && !s.jobLoss) return { value: m.I, note: "I" };
  if (mode === "judge") return { value: s.incomePct * m.I, note: `${pct(s.incomePct)} × I` };
  // realistic: pension keeps paying; EI replaces a share of earnings up to the weekly max
  const earned = s.incomePct * m.nonPensionI;
  const capped = s.jobLoss ? Math.min(earned, EI_MONTHLY_CAP) : earned;
  const note =
    (s.jobLoss && earned > EI_MONTHLY_CAP ? `EI capped at $${Math.round(EI_MONTHLY_CAP).toLocaleString()}/mo` : `${pct(s.incomePct)} × earnings`) +
    (m.pension > 0 ? " + pension" : "");
  return { value: capped + m.pension, note };
}

export function scenario(m: Metrics, s: Shock, mode: Mode = "judge", lv: Levers = NO_LEVERS): Scenario {
  const inc = incomeAfter(m, s, mode);
  // same operation order as Python: (S + bills*H) + extra
  let spending = m.S + s.billsPct * m.H + s.extraMonthly;
  const notes = ["S"];
  if (s.billsPct) notes.push(`${pct(s.billsPct)} × H`);
  if (s.extraMonthly) notes.push(`$${Math.round(s.extraMonthly).toLocaleString()}`);
  if (lv.discCut) {
    spending -= lv.discCut * m.disc;
    notes.push(`− ${pct(lv.discCut)} of discretionary`);
  }
  if (lv.pauseLoan && m.P > 0) {
    spending -= m.P;
    notes.push("− loan payment");
  }
  const oneOff = s.oneOffMult * m.S + s.oneOffAbs;
  const r = runway(m.B, oneOff, spending, inc.value);
  return {
    income: inc.value,
    spending,
    oneOff,
    bufferLeft: m.B - oneOff,
    gap: spending - inc.value,
    runway: r,
    incomeNote: inc.note,
    spendingNote: notes.join(" + ").replace(/\+ −/g, "−"),
  };
}

export function pct(x: number): string {
  return `${Math.round(x * 1000) / 10}%`;
}

/** Month-by-month balance path: shock lasts `durationMonths`, then the baseline resumes. */
export function balancePath(m: Metrics, s: Shock, mode: Mode, lv: Levers, horizon = 18) {
  // levers (spending cuts, loan deferral) only apply while the shock lasts
  const shocked = scenario(m, s, mode, lv);
  const base = scenario(m, NO_SHOCK, mode);
  const pts: { month: number; balance: number; baseline: number }[] = [];
  let bal = m.B - shocked.oneOff;
  let baseBal = m.B;
  pts.push({ month: 0, balance: bal, baseline: baseBal });
  for (let t = 1; t <= horizon; t++) {
    const gap = t <= s.durationMonths ? shocked.gap : base.gap;
    bal -= gap;
    baseBal -= base.gap;
    pts.push({ month: t, balance: bal, baseline: baseBal });
  }
  return pts;
}

export interface Verdict {
  survives: boolean;
  monthsShort: number; // 0 if survives
  moneyNeeded: number; // extra buffer needed to last the duration
  spare: number; // buffer left at end of duration if survives
  wipedOut: boolean; // one-off costs alone empty the buffer (runway 0)
  shortToday: number; // how far below zero the buffer is right after one-off costs
}

export function verdict(sc: Scenario, durationMonths: number): Verdict {
  if (sc.bufferLeft <= 0) {
    // the one-off cost can't be covered: runway is 0 regardless of the monthly gap
    const shortToday = -sc.bufferLeft;
    return {
      survives: false,
      monthsShort: durationMonths,
      moneyNeeded: shortToday + Math.max(sc.gap, 0) * durationMonths,
      spare: 0,
      wipedOut: true,
      shortToday,
    };
  }
  if (sc.runway === null)
    return { survives: true, monthsShort: 0, moneyNeeded: 0, spare: sc.bufferLeft - sc.gap * durationMonths, wipedOut: false, shortToday: 0 };
  const need = sc.gap * durationMonths;
  const survives = sc.runway >= durationMonths;
  return {
    survives,
    monthsShort: survives ? 0 : Math.max(0, durationMonths - sc.runway),
    moneyNeeded: survives ? 0 : Math.max(0, need - sc.bufferLeft),
    spare: survives ? sc.bufferLeft - need : 0,
    wipedOut: false,
    shortToday: 0,
  };
}

// ---------------- Plans ----------------

export interface GoalPlan {
  target: number;
  targetReason: string;
  current: number;
  shortfall: number;
  surplus: number; // I - S
  cutNeeded: number; // discretionary cut (share) needed to create a surplus, if no surplus
  monthly: number; // suggested monthly contribution
  monthsToGoal: number | null;
  fastMonthly: number;
  fastMonths: number | null;
  steps: { label: string; amount: number; month: number | null }[];
}

export function goalPlan(m: Metrics, mode: Mode, saveShare = 0.5): GoalPlan {
  const job = scenario(m, { ...NO_SHOCK, incomePct: EI_RATE, jobLoss: true }, mode);
  const jobGap = Math.max(job.gap, 0);
  const sixMonthsEI = 6 * jobGap;
  const threeMonthsFixed = 3 * m.F;
  const target = Math.max(sixMonthsEI, threeMonthsFixed, m.S);
  const targetReason =
    target === sixMonthsEI
      ? "enough to survive 6 months of EI after a job loss"
      : target === threeMonthsFixed
        ? "3 months of fixed costs (bills, insurance, loan)"
        : "one month of typical spending";
  const shortfall = Math.max(0, target - m.B);
  const surplus = m.I - m.S;
  let cutNeeded = 0;
  let monthly: number;
  if (surplus > 0) {
    monthly = surplus * saveShare;
  } else {
    // free up a surplus by trimming discretionary spending: cover the gap plus 10% of discretionary
    const needed = -surplus + 0.1 * m.disc;
    cutNeeded = m.disc > 0 ? Math.min(1, needed / m.disc) : 0;
    monthly = Math.max(0, cutNeeded * m.disc + surplus);
  }
  const monthsToGoal = shortfall === 0 ? 0 : monthly > 0 ? Math.ceil(shortfall / monthly) : null;
  // faster route: also redirect 10% of flexible spending into savings
  const fastMonthly = monthly + BACKUP_TRIM * m.disc;
  const fastMonths = shortfall > 0 && m.disc > 0 && fastMonthly > 0 ? Math.ceil(shortfall / fastMonthly) : null;
  const milestones = [
    { label: "1 month of spending", amount: m.S },
    { label: "3 months of fixed costs", amount: threeMonthsFixed },
    { label: "Survive 6 months of EI", amount: sixMonthsEI },
  ]
    .filter((x) => x.amount > 0)
    .sort((a, b) => a.amount - b.amount)
    .map((x) => ({
      ...x,
      month: x.amount <= m.B ? 0 : monthly > 0 ? Math.ceil((x.amount - m.B) / monthly) : null,
    }));
  return { target, targetReason, current: m.B, shortfall, surplus, cutNeeded, monthly, monthsToGoal, fastMonthly, fastMonths, steps: milestones };
}

export const BACKUP_TRIM = 0.1;
export const BACKUP_SURVIVAL = 0.25;
export function fullPlanLevers(m: Metrics): Levers {
  return { discCut: m.disc > 0 ? BACKUP_SURVIVAL : 0, pauseLoan: m.P > 0 };
}

export interface BackupStep {
  label: string;
  detail: string;
  runway: number | null;
  gained: number | null; // months gained vs previous step (null = became no-shortfall)
}

export function backupPlan(m: Metrics, s: Shock, mode: Mode): BackupStep[] {
  const steps: BackupStep[] = [];
  const add = (label: string, detail: string, lv: Levers) => {
    const r = scenario(m, s, mode, lv).runway;
    const prev = steps.length ? steps[steps.length - 1].runway : null;
    const gained = r === null ? null : prev === null && steps.length ? 0 : r - (prev ?? r);
    steps.push({ label, detail, runway: r, gained });
  };
  add("As things stand", "Shock hits, no changes", NO_LEVERS);
  if (m.disc > 0)
    add("Trim flexible spending 10%", `Card & cash spending, other transfers: −$${fmt(BACKUP_TRIM * m.disc)}/mo`, {
      discCut: BACKUP_TRIM,
      pauseLoan: false,
    });
  if (m.P > 0)
    add("Ask to defer the loan payment", `A payment deferral frees $${fmt(m.P)}/mo`, { discCut: BACKUP_TRIM, pauseLoan: true });
  if (m.disc > 0)
    add("Cut flexible spending 25%", `Survival mode, must-pays only: −$${fmt(BACKUP_SURVIVAL * m.disc)}/mo`, {
      discCut: BACKUP_SURVIVAL,
      pauseLoan: m.P > 0,
    });
  return steps;
}

export function fmt(x: number, digits = 0): string {
  return x.toLocaleString("en-CA", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function money(x: number): string {
  const sign = x < 0 ? "−" : "";
  return `${sign}$${fmt(Math.abs(x))}`;
}

// ---------------- Data decoding ----------------

export interface MetricsFile {
  columns: string[];
  rows: (number | string | null)[][];
  eiMonthlyCap: number;
}

export function decodeMetrics(f: MetricsFile): Map<number, Metrics> {
  const out = new Map<number, Metrics>();
  for (const row of f.rows) {
    const o: Record<string, unknown> = {};
    f.columns.forEach((c, i) => (o[c] = row[i] ?? 0));
    if (o.incomeCV === 0) o.incomeCV = null;
    out.set(o.id as number, o as unknown as Metrics);
  }
  return out;
}
