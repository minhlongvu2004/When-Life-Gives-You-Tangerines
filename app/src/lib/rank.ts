// Resilience Rank: reads the precomputed ranking (pipeline/build_rank.py → public/data/rank.json)
// and re-scores hypothetical changes with exactly the same rules, which live in rank.json's meta.
// A custom datathon index — not an official Tangerine score or a credit score.

export type CategoryKey = "buffer" | "cashflow" | "stability" | "debt";
export type LeagueKey = "diamond" | "platinum" | "gold" | "silver" | "bronze";
export const CATEGORIES: CategoryKey[] = ["buffer", "cashflow", "stability", "debt"];

export interface RankMeta {
  asOf: string;
  n: number;
  total: number;
  excludedByReason: Record<string, number>;
  weights: Record<CategoryKey, number>;
  curves: Record<"buffer" | "cashflow" | "cv" | "low" | "debt", [number, number][]>;
  stabilityMix: { cv: number; low: number };
  window: number;
  neutral: number;
  debtRules: { noRecord: number; repaid: number; pastDefault: number; inArrearsPenalty: number };
  leagues: { key: LeagueKey; name: string; top: number }[];
  thresholds: Record<LeagueKey, { minScore: number; maxRank: number; count: number }>;
  median: number;
  top10: number;
  tieRule: string;
}

export interface Inputs {
  I: number; // median monthly money in
  S: number; // median monthly money out
  B: number; // buffer: mean avg_daily_balance, last 6 months
  cv: number; // variability of monthly money in (24-month window)
  low: number; // share of low-income months
  nWin: number; // months in the income window
  obl: number; // monthly debt obligations (running loan + leasing)
  P: number; // running loan payment (loans.csv)
  lease: number; // leasing standing orders
  status: string; // loan status A/B/C/D or ""
  loanEnd: string; // YYYY-MM of the running loan's last payment
}

export interface RankRow extends Inputs {
  id: number;
  rank: number;
  score: number; // rounded to 1 decimal, used for ranking
  buffer: number;
  cashflow: number;
  stability: number;
  debt: number;
}

export interface RankData {
  meta: RankMeta;
  rows: RankRow[]; // sorted by rank
  byId: Map<number, RankRow>;
  excluded: Map<number, string>;
  sortedScores: number[]; // descending
  catSorted: Record<CategoryKey, number[]>; // ascending, for category percentiles
}

interface RankFile {
  meta: RankMeta;
  cols: string[];
  rows: (number | string)[][];
  excluded: [number, string][];
}

export function decodeRank(f: RankFile): RankData {
  const rows = f.rows.map((r) => {
    const o: Record<string, unknown> = {};
    f.cols.forEach((c, i) => (o[c] = r[i]));
    return o as unknown as RankRow;
  });
  const catSorted = Object.fromEntries(CATEGORIES.map((c) => [c, rows.map((r) => r[c]).sort((a, b) => a - b)])) as Record<CategoryKey, number[]>;
  return {
    meta: f.meta,
    rows,
    byId: new Map(rows.map((r) => [r.id, r])),
    excluded: new Map(f.excluded),
    sortedScores: rows.map((r) => r.score),
    catSorted,
  };
}

let rankP: Promise<RankData> | null = null;
export function loadRank(): Promise<RankData> {
  rankP ??= fetch("/data/rank.json")
    .then((r) => {
      if (!r.ok) throw new Error(`rank.json ${r.status}`);
      return r.json() as Promise<RankFile>;
    })
    .then(decodeRank)
    .catch((e) => {
      rankP = null; // allow a retry
      throw e;
    });
  return rankP;
}

/* ------------------------------------------------------------------ scoring (mirrors build_rank.py) */

export function curve(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}

export interface Scored {
  buffer: number;
  cashflow: number;
  stability: number;
  debt: number;
  score: number;
  coverage: number; // months of spending the buffer covers
  ratio: number; // (in − out) / max(in, out)
  dti: number; // obligations / income
}

export function scoreFromInputs(a: Inputs, meta: RankMeta): Scored {
  const { curves: C, weights: W } = meta;
  const coverage = a.B > 0 && a.S > 0 ? a.B / a.S : a.B > 0 ? Infinity : 0;
  const buffer = curve(C.buffer, coverage);
  const denom = Math.max(a.I, a.S);
  const ratio = denom > 0 ? (a.I - a.S) / denom : 0;
  const cashflow = curve(C.cashflow, ratio);
  const raw = meta.stabilityMix.cv * curve(C.cv, a.cv) + meta.stabilityMix.low * curve(C.low, a.low);
  const h = Math.min(1, a.nWin / meta.window);
  const stability = h * raw + (1 - h) * meta.neutral;
  const dti = a.I > 0 ? a.obl / a.I : a.obl > 0 ? Infinity : 0;
  let debt: number;
  if (a.obl > 0) {
    debt = curve(C.debt, dti);
    if (a.status === "D") debt = Math.max(0, debt - meta.debtRules.inArrearsPenalty);
  } else if (a.status === "A") debt = meta.debtRules.repaid;
  else if (a.status === "B") debt = meta.debtRules.pastDefault;
  else debt = meta.debtRules.noRecord;
  const score = W.buffer * buffer + W.cashflow * cashflow + W.stability * stability + W.debt * debt;
  return { buffer, cashflow, stability, debt, score, coverage, ratio, dti };
}

export const round1 = (x: number) => Math.round(x * 10 + 1e-9) / 10;

/* ------------------------------------------------------------------ rank, percentile, league */

/** Number of values in a descending array strictly greater than x. */
function countAbove(desc: number[], x: number): number {
  let lo = 0;
  let hi = desc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (desc[mid] > x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Rank a (hypothetical) score against everyone else, with the same tie rule as the precompute. */
export function rankOf(data: RankData, score: number, self?: RankRow): number {
  const s = round1(score);
  let above = countAbove(data.sortedScores, s);
  if (self && self.score > s) above -= 1; // don't compete with your own current score
  return above + 1;
}

export function leagueOfRank(meta: RankMeta, rank: number): LeagueKey {
  const f = (rank - 1) / meta.n;
  return (meta.leagues.find((l) => f < l.top) ?? meta.leagues[meta.leagues.length - 1]).key;
}

export function leagueInfo(meta: RankMeta, key: LeagueKey) {
  const i = meta.leagues.findIndex((l) => l.key === key);
  const L = meta.leagues[i];
  const prevTop = i > 0 ? meta.leagues[i - 1].top : 0;
  return { ...L, index: i, from: prevTop, share: L.top - prevTop, ...meta.thresholds[key] };
}

/** "Top X%" — the share of ranked accounts at or above this rank. */
export const topPct = (rank: number, n: number) => (rank / n) * 100;
/** Share of ranked accounts with a lower score. */
export const beatsPct = (data: RankData, score: number) => ((data.meta.n - countAbove(data.sortedScores, score - 1e-9)) / data.meta.n) * 100;

export function catPercentile(data: RankData, c: CategoryKey, v: number): number {
  const a = data.catSorted[c];
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v - 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return (lo / a.length) * 100; // share strictly below
}

export interface NextLeague {
  current: LeagueKey;
  next: LeagueKey | null;
  needScore: number | null; // lowest score currently holding the next league
  gap: number | null;
  positions: number | null; // places to climb to enter it
}

export function nextLeague(data: RankData, row: RankRow): NextLeague {
  const cur = leagueOfRank(data.meta, row.rank);
  const i = data.meta.leagues.findIndex((l) => l.key === cur);
  if (i === 0) return { current: cur, next: null, needScore: null, gap: null, positions: null };
  const nx = data.meta.leagues[i - 1].key;
  const t = data.meta.thresholds[nx];
  return { current: cur, next: nx, needScore: t.minScore, gap: Math.max(0, round1(t.minScore - row.score)), positions: Math.max(1, row.rank - t.maxRank) };
}

/* ------------------------------------------------------------------ labels */

/** The datasets have no customer names, so an account is only ever shown by its real account_id. */
export const accountLabel = (id: number) => `Account #${id}`;

/* ------------------------------------------------------------------ hypothetical changes */

export interface Changes {
  save: number; // extra $ set aside each month (kept in the account → buffer only)
  cut: number; // $ less spent each month → spending, cash flow, buffer
  income: number; // $ change in monthly income → income, cash flow, debt ratio, buffer
  extraLoan: number; // extra $ paid on the loan each month → spending until paid off, then the payment ends
  months: number; // projection horizon
}
export const NO_CHANGES: Changes = { save: 0, cut: 0, income: 0, extraLoan: 0, months: 12 };

/** Months of loan payments left as of `now` (YYYY-MM), from the loan's schedule. */
export function loanMonthsLeft(row: Inputs, now: { y: number; m: number }): number {
  if (!row.P || !row.loanEnd) return 0;
  const [y, m] = row.loanEnd.split("-").map(Number);
  return Math.max(0, y * 12 + m - (now.y * 12 + now.m));
}

export interface Projection {
  inputs: Inputs;
  scored: Scored;
  score: number; // projected overall score, 1 decimal
  rank: number;
  league: LeagueKey;
  topPct: number;
  paidOffAt: number | null; // month the loan is cleared within the horizon
  notes: string[];
}

/**
 * Apply changes for `months` months and re-score. Only measures the action can logically move are
 * changed: saving touches the buffer; spending cuts touch spending and the buffer; income touches
 * income (not its stability); extra loan payments touch spending until the loan is gone.
 */
export function project(data: RankData, row: RankRow, ch: Changes, now: { y: number; m: number }): Projection {
  const T = Math.max(0, ch.months);
  const a: Inputs = { ...row };
  const notes: string[] = [];
  a.I = Math.max(0, row.I + ch.income);
  a.S = Math.max(0, row.S - ch.cut);
  let bufferDelta = T * (ch.save + ch.cut + ch.income);
  let paidOffAt: number | null = null;
  const left = loanMonthsLeft(row, now);
  if (ch.extraLoan > 0 && row.P > 0 && left > 0) {
    const balance = row.P * left; // loans.csv: amount = duration × payment, no separate interest
    const m = Math.ceil(balance / (row.P + ch.extraLoan));
    if (m <= T) {
      paidOffAt = m;
      const extraPaid = Math.max(0, balance - row.P * m);
      bufferDelta += -extraPaid + row.P * (T - m); // after payoff the regular payment is freed
      a.S = Math.max(0, a.S - row.P);
      a.obl = Math.max(0, row.obl - row.P);
      if (a.obl === 0 && !a.lease) a.status = "A";
      notes.push(`Loan paid off in month ${m}`);
    } else {
      bufferDelta -= ch.extraLoan * T;
      a.S += ch.extraLoan;
      notes.push(`Loan not cleared within ${T} months`);
    }
  }
  a.B = row.B + bufferDelta;
  const base = scoreFromInputs(row, data.meta);
  const sc = scoreFromInputs(a, data.meta);
  // apply the change on top of the stored score, so "no changes" reproduces the published score exactly
  const score = round1(Math.min(100, Math.max(0, row.score + (sc.score - base.score))));
  const rank = rankOf(data, score, row);
  return { inputs: a, scored: sc, score, rank, league: leagueOfRank(data.meta, rank), topPct: topPct(rank, data.meta.n), paidOffAt, notes };
}

/** Smallest value of one lever (searched up to `max`) that lifts the score to `target`; null if out of reach. */
export function leverToReach(
  data: RankData,
  row: RankRow,
  lever: keyof Omit<Changes, "months">,
  target: number,
  months: number,
  max: number,
  now: { y: number; m: number },
): number | null {
  const at = (v: number) => project(data, row, { ...NO_CHANGES, months, [lever]: v }, now).score;
  if (at(0) >= target) return 0;
  if (max <= 0 || at(max) < target) return null;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= target) hi = mid;
    else lo = mid;
  }
  const step = hi >= 1000 ? 50 : 10;
  return Math.ceil(hi / step) * step;
}

/* ------------------------------------------------------------------ explanations */

export const CATEGORY_META: Record<CategoryKey, { name: string; short: string; how: (r: RankRow, s: Scored) => string; improve: string }> = {
  buffer: {
    name: "Savings Buffer",
    short: "Buffer",
    how: (r, s) =>
      `Your savings average ${money(r.B)} over the last 6 months against typical spending of ${money(r.S)}/mo: ${
        Number.isFinite(s.coverage) ? `${s.coverage.toFixed(1)} months` : "many months"
      } of cover.`,
    improve: "Set aside a fixed amount each payday so your cushion grows month after month.",
  },
  cashflow: {
    name: "Cash Flow Health",
    short: "Cash flow",
    how: (r, s) =>
      `Typical money in ${money(r.I)}/mo vs money out ${money(r.S)}/mo: a ${s.ratio >= 0 ? "surplus" : "shortfall"} of ${money(Math.abs(r.I - r.S))}, or ${Math.abs(
        s.ratio * 100,
      ).toFixed(1)}% of your monthly flow.`,
    improve: "Trimming regular spending widens the gap between what comes in and what goes out.",
  },
  stability: {
    name: "Income Stability",
    short: "Stability",
    how: (r) =>
      `Over your last ${r.nWin} complete months, monthly money in varied by ${Math.round(r.cv * 100)}% on average, and ${Math.round(r.low * 100)}% of months came in under half your usual amount.${
        r.nWin < 24 ? " Shorter histories are pulled toward a neutral score." : ""
      }`,
    improve: "Irregular income isn't a problem in itself; a bigger buffer smooths the uneven months.",
  },
  debt: {
    name: "Debt Burden",
    short: "Debt",
    how: (r, s) =>
      r.obl > 0
        ? `Loan and leasing payments of ${money(r.obl)}/mo take ${(s.dti * 100).toFixed(1)}% of your typical money in${r.status === "D" ? "; the loan record shows arrears" : ""}.`
        : r.status === "A"
          ? "Your loan on record is fully repaid and no payments are running."
          : r.status === "B"
            ? "No payments are running now, but a past loan on record was not repaid."
            : "No loan or leasing payments on record at this bank. That doesn't prove you're debt-free elsewhere, so this caps at 90.",
    improve: "Extra payments that clear a loan sooner free up that monthly payment for good.",
  },
};

export function money(x: number): string {
  return `${x < 0 ? "−" : ""}$${Math.round(Math.abs(x)).toLocaleString("en-CA")}`;
}
