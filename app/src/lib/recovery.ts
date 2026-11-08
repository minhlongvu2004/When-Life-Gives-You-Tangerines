// Recovery model: a month-by-month projection of one account through a disruption and the rebuild after it.
//
// Rules (from the approved design):
//  - Available money can't go below $0. Anything the account can't cover is tracked separately as an
//    "unpaid amount" (it would have to be borrowed, delayed or cut), never as negative savings.
//  - Nothing is saved in a month with a shortfall. After that, a share of each month's leftover first clears the
//    unpaid amount, then rebuilds the buffer.
//  - Cuts and any loan deferral apply only during the disruption. A deferred payment is repaid afterwards.
//  - It's a projection from account records plus assumptions, not a prediction.
import { NO_LEVERS, NO_SHOCK, money, scenario, type Levers, type Metrics, type Mode, type Shock } from "./engine";

export const HORIZON = 96; // months (8 years)
export const REBUILD_SHARE = 0.5; // share of each month's leftover put toward catching up and rebuilding
export const REPAY_MONTHS = 12; // a deferred loan payment is repaid over this many months afterwards (no interest modelled)

export interface RecoveryInputs {
  startFunds: number; // money available in the account at month 0
  startGap: number; // unpaid at month 0 (one-time costs bigger than the account)
  durationMonths: number; // length of the disruption
  incomeDuring: number;
  incomeAfter: number; // income once the disruption ends
  spendingDuring: number; // already includes any cuts and deferral
  spendingAfter: number;
  deferralPerMonth: number; // loan payment deferred during the disruption (0 = none)
  starter: number; // "1 month of essentials"
  target: number; // buffer target
  rebuildShare?: number;
  repayMonths?: number;
  horizon?: number;
}

export interface RecoveryRow {
  month: number;
  funds: number; // available money at the end of the month, never below 0
  gap: number; // unpaid amount so far, never below 0
  income: number;
  spending: number;
  repay: number; // deferral catch-up paid this month
  net: number; // income - spending - repay
}

export interface RecoveryResult {
  rows: RecoveryRow[];
  runsOutMonth: number | null; // first month the account can't cover the month (0 = one-time costs alone)
  peakGap: number;
  shortfallEndsMonth: number | null; // first month after the last month with a shortfall (0 = never had one, null = never ends)
  caughtUpMonth: number | null; // unpaid amount cleared (null = nothing unpaid, or not cleared in the horizon)
  backToStarterMonth: number | null; // back above 1 month of essentials for good (0 = never fell below, null = not reached)
  targetMonth: number | null; // buffer target reached for good (0 = already there, null = not reached)
}

/** The last month the account was below a level (or owed something), plus one. 0 = never below; null = still below at the end. */
function recoveredAfter(rows: RecoveryRow[], level: number): number | null {
  let lastBelow = -1;
  for (const r of rows) if (r.funds < level || r.gap > 0) lastBelow = r.month;
  if (lastBelow < 0) return 0;
  return lastBelow >= rows.length - 1 ? null : lastBelow + 1;
}

export function simulateRecovery(i: RecoveryInputs): RecoveryResult {
  const horizon = i.horizon ?? HORIZON;
  const share = i.rebuildShare ?? REBUILD_SHARE;
  const repayMonths = i.repayMonths ?? REPAY_MONTHS;
  const repayEach = i.deferralPerMonth > 0 ? (i.deferralPerMonth * i.durationMonths) / repayMonths : 0;

  let funds = Math.max(0, i.startFunds);
  let gap = Math.max(0, i.startGap);
  const rows: RecoveryRow[] = [{ month: 0, funds, gap, income: 0, spending: 0, repay: 0, net: 0 }];
  let runsOutMonth: number | null = funds <= 0 && gap > 0 ? 0 : null;
  let peakGap = gap;
  let lastShortfall = 0;

  for (let t = 1; t <= horizon; t++) {
    const during = t <= i.durationMonths;
    const income = during ? i.incomeDuring : i.incomeAfter;
    const spending = during ? i.spendingDuring : i.spendingAfter;
    const repay = !during && t <= i.durationMonths + repayMonths ? repayEach : 0;
    const net = income - spending - repay;
    if (net < 0) {
      const need = -net;
      const take = Math.min(funds, need);
      funds -= take;
      gap += need - take;
      lastShortfall = t;
      if (runsOutMonth === null && funds <= 0) runsOutMonth = t;
    } else {
      // nothing is saved in a month with a shortfall; otherwise a share of the leftover clears the unpaid amount first
      const contribution = net * share;
      const pay = Math.min(gap, contribution);
      gap -= pay;
      funds += contribution - pay;
    }
    peakGap = Math.max(peakGap, gap);
    rows.push({ month: t, funds, gap, income, spending, repay, net });
  }

  let lastOwing = -1;
  for (const r of rows) if (r.gap > 0) lastOwing = r.month;
  return {
    rows,
    runsOutMonth,
    peakGap,
    shortfallEndsMonth: lastShortfall === 0 ? 0 : lastShortfall >= horizon ? null : lastShortfall + 1,
    caughtUpMonth: peakGap <= 0 || lastOwing >= horizon ? null : lastOwing + 1,
    backToStarterMonth: recoveredAfter(rows, i.starter),
    targetMonth: recoveredAfter(rows, i.target),
  };
}

// ---------------------------------------------------------------- plans

export type PlanKey = "none" | "A" | "B" | "C";

export interface PlanDef {
  key: PlanKey;
  name: string;
  detail: string; // one line on what changes
  levers: Levers;
  trimPct: number;
  deferral: boolean; // depends on the lender agreeing
}

/** The plans offered for a customer. They adapt to what the account actually has (flexible spending, a running loan). */
export function planDefs(m: Metrics): PlanDef[] {
  const loan = m.P > 0;
  const flex = m.disc > 0;
  const none: PlanDef = { key: "none", name: "No changes", detail: "Nothing changes while it lasts", levers: NO_LEVERS, trimPct: 0, deferral: false };
  const plans: PlanDef[] = [none];
  if (flex) {
    plans.push({ key: "A", name: "Trim 10%", detail: "Spend 10% less on card, cash and other transfers", levers: { discCut: 0.1, pauseLoan: false }, trimPct: 0.1, deferral: false });
    plans.push(
      loan
        ? { key: "B", name: "Trim 10% + ask lender", detail: "Same trim, and ask to defer the loan payment", levers: { discCut: 0.1, pauseLoan: true }, trimPct: 0.1, deferral: true }
        : { key: "B", name: "Trim 15%", detail: "Spend 15% less on card, cash and other transfers", levers: { discCut: 0.15, pauseLoan: false }, trimPct: 0.15, deferral: false },
    );
    plans.push({
      key: "C",
      name: loan ? "Tightest: trim 25% + ask lender" : "Tightest: trim 25%",
      detail: loan ? "Spend 25% less, and ask to defer the loan payment" : "Spend 25% less on card, cash and other transfers",
      levers: { discCut: 0.25, pauseLoan: loan },
      trimPct: 0.25,
      deferral: loan,
    });
  } else if (loan) {
    plans.push({ key: "A", name: "Ask lender", detail: "Ask to defer the loan payment", levers: { discCut: 0, pauseLoan: true }, trimPct: 0, deferral: true });
  }
  return plans;
}

/** Essentials we can see: bills, insurance and loan payments labelled in the account. Falls back to all spending if none are labelled. */
export function essentialsBasis(m: Metrics): { monthly: number; labelled: boolean } {
  return m.F >= 1 ? { monthly: m.F, labelled: true } : { monthly: m.S, labelled: false };
}

export interface RecoveryOptions {
  targetMonths: 3 | 6;
  rebuildShare?: number;
  extraMonths?: number; // "the disruption lasts longer"
  deferralRefused?: boolean; // "the lender says no"
}

export function recoveryInputs(m: Metrics, shock: Shock, mode: Mode, plan: PlanDef, opts: RecoveryOptions): RecoveryInputs {
  const levers: Levers = { ...plan.levers, pauseLoan: plan.levers.pauseLoan && !opts.deferralRefused };
  const during = scenario(m, shock, mode, levers);
  const after = scenario(m, NO_SHOCK, mode);
  const { monthly } = essentialsBasis(m);
  return {
    startFunds: Math.max(0, m.B - during.oneOff),
    startGap: Math.max(0, during.oneOff - m.B),
    durationMonths: shock.durationMonths + (opts.extraMonths ?? 0),
    incomeDuring: during.income,
    incomeAfter: after.income,
    spendingDuring: during.spending,
    spendingAfter: after.spending,
    deferralPerMonth: levers.pauseLoan && m.P > 0 ? m.P : 0,
    starter: monthly,
    target: opts.targetMonths * monthly,
    rebuildShare: opts.rebuildShare,
  };
}

// ---------------------------------------------------------------- monthly bridge

export interface BridgeRow {
  key: string;
  label: string;
  value: number; // signed monthly dollars: money in is +, money out is -, a change that helps is +
  kind: "in" | "out" | "change" | "result";
}

/** Money in and out during the disruption, then what each change in the plan does to the monthly gap. */
export function monthlyBridge(m: Metrics, shock: Shock, mode: Mode, plan: PlanDef, opts: Pick<RecoveryOptions, "deferralRefused"> = {}): { rows: BridgeRow[]; netNoChange: number; netWithPlan: number } {
  const none = scenario(m, shock, mode, NO_LEVERS);
  const essentials = m.F >= 1 ? Math.min(m.F, m.S) : 0;
  const newCosts = shock.billsPct * m.H + shock.extraMonthly;
  const other = m.S - essentials;
  const netNoChange = none.income - none.spending;
  const trim = plan.levers.discCut * m.disc;
  const defer = plan.levers.pauseLoan && !opts.deferralRefused && m.P > 0 ? m.P : 0;

  const rows: BridgeRow[] = [{ key: "in", label: shock.jobLoss ? "Money in (EI estimate)" : "Money in", value: none.income, kind: "in" }];
  if (essentials > 0) rows.push({ key: "ess", label: "Essentials we can see", value: -essentials, kind: "out" });
  if (newCosts > 0) rows.push({ key: "new", label: "New or higher costs", value: -newCosts, kind: "out" });
  rows.push({ key: "other", label: "Other spending", value: -other, kind: "out" });
  rows.push({ key: "none", label: netNoChange >= 0 ? "Left over (no changes)" : "Short (no changes)", value: netNoChange, kind: "result" });
  if (trim > 0) rows.push({ key: "trim", label: `Trim ${Math.round(plan.levers.discCut * 100)}% of card, cash and transfers`, value: trim, kind: "change" });
  if (defer > 0) rows.push({ key: "defer", label: "Loan payment deferred (lender decides)", value: defer, kind: "change" });
  const netWithPlan = netNoChange + trim + defer;
  if (trim > 0 || defer > 0) rows.push({ key: "plan", label: netWithPlan >= 0 ? "Left over (with your plan)" : "Short (with your plan)", value: netWithPlan, kind: "result" });
  return { rows, netNoChange, netWithPlan };
}

// ---------------------------------------------------------------- wording helpers

/** Dollar amounts with sensible precision: nearest $10 under $1,000, nearest $100 above. */
export function roundedMoney(x: number): string {
  const a = Math.abs(x);
  const r = a < 1000 ? Math.round(a / 10) * 10 : Math.round(a / 100) * 100;
  return money(x < 0 ? -r : r);
}

/** A month count in plain words. Whole months up to a year, then about the nearest 3 months. */
export function durationWords(months: number | null): string {
  if (months === null) return "not within 8 years";
  if (months <= 0) return "already there";
  if (months <= 12) return `${months} month${months === 1 ? "" : "s"}`;
  const q = Math.round(months / 3) * 3;
  const y = Math.floor(q / 12);
  const mo = q % 12;
  const parts = [y ? `${y} year${y === 1 ? "" : "s"}` : "", mo ? `${mo} month${mo === 1 ? "" : "s"}` : ""].filter(Boolean);
  return `about ${parts.join(" ")}`;
}
