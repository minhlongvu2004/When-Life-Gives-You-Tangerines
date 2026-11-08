// Tangerine Pulse: the score and the simulator come from the Resilience Rank engine (lib/rank.ts,
// built from rank.json), so an account has one score across the whole app. This file adds the
// precomputed account history (pulse.json) and the juice geometry. The 3D scene only ever receives
// a 0–100 value from here; it never computes or changes a score itself.

import { CATEGORIES, project, scoreFromInputs, type CategoryKey, type Changes, type Inputs, type RankData, type RankRow, type Scored } from "./rank";

export interface PulseHistory {
  id: number;
  from: string; // first month of the 12-month window
  to: string; // last month with data
  trendIn: number | null; // last 6 vs previous 6 months, share
  trendOut: number | null;
  negMonths: number; // months (of 12) that ended at least one day below zero
  lowBal: number | null; // lowest end-of-day balance in the window
  F: number; // typical fixed costs: bills + insurance + loan payments (median)
  bigCount: number; // single payments >= a month of typical spending
  bigAmt: number | null;
  bigMonth: string | null;
  bigOp: string | null; // operation from transactions.csv
  bigPurpose: string | null; // labelled purpose, "" if unlabelled
  penCount: number; // penalty-interest charges
  penTotal: number;
  debits: number; // number of payments out in the window
  soCount: number; // standing orders
  soTotal: number;
  soBills: number;
  soIns: number;
  soLease: number;
  soLoan: number;
  soOther: number;
}

interface PulseFile {
  meta: { largeShare: number; window: number; note: string };
  cols: string[];
  rows: (number | string | null)[][];
}

export interface PulseData {
  meta: PulseFile["meta"];
  byId: Map<number, PulseHistory>;
}

let pulseP: Promise<PulseData> | null = null;
export function loadPulse(): Promise<PulseData> {
  pulseP ??= fetch("/data/pulse.json")
    .then((r) => {
      if (!r.ok) throw new Error(`pulse.json ${r.status}`);
      return r.json() as Promise<PulseFile>;
    })
    .then((f) => {
      const byId = new Map<number, PulseHistory>();
      for (const row of f.rows) {
        const o: Record<string, unknown> = {};
        f.cols.forEach((c, i) => (o[c] = row[i]));
        byId.set(o.id as number, o as unknown as PulseHistory);
      }
      return { meta: f.meta, byId };
    })
    .catch((e) => {
      pulseP = null;
      throw e;
    });
  return pulseP;
}

/* ------------------------------------------------------------------ juice geometry */

/**
 * Fill height (0..1 of the fruit's interior height) that holds `volume` (0..1) of an ellipsoid.
 * Scaling a sphere vertically doesn't change volume fractions, so the sphere-cap formula applies:
 * V(t) = 3t² − 2t³ for height fraction t, inverted exactly as t = ½ − sin(asin(1 − 2V) / 3).
 * A 72% score therefore fills 72% of the interior VOLUME (at a height of about 65%).
 */
export function volumeToHeight(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
}
export function heightToVolume(t: number): number {
  const h = Math.min(1, Math.max(0, t));
  return 3 * h * h - 2 * h * h * h;
}

/* ------------------------------------------------------------------ bands and milestones */

export type Band = "high" | "moderate" | "lower";
export const bandOf = (score: number): Band => (score >= 80 ? "high" : score >= 50 ? "moderate" : "lower");
export const BAND = {
  high: { label: "High resilience", color: "#32D6A0" },
  moderate: { label: "Moderate resilience", color: "#FFBF47" },
  lower: { label: "Building resilience", color: "#FF6B80" },
} as const;
export const MILESTONES = [50, 75, 90];

/** The milestone crossed going up from `from` to `to`, if any (highest one). */
export function milestoneCrossed(from: number, to: number): number | null {
  const hit = MILESTONES.filter((m) => from < m && to >= m);
  return hit.length ? hit[hit.length - 1] : null;
}

/* ------------------------------------------------------------------ simulation */

export interface PulseChanges {
  save: number; // extra saved each month, taken out of the current surplus
  spend: number; // change in monthly spending: negative = spend less, positive = spend more
  income: number; // change in monthly income
  extraLoan: number; // extra loan repayment per month
  months: number;
}
export const NO_PULSE_CHANGES: PulseChanges = { save: 0, spend: 0, income: 0, extraLoan: 0, months: 12 };

export interface PulseProjection {
  score: number; // 1 decimal, same scale as rank.json
  inputs: Inputs; // the account's measurements after the changes
  paidOffAt: number | null;
  scored: Scored;
  base: Scored;
  effectiveSave: number; // save after capping at the available surplus
  deltas: { key: CategoryKey; points: number }[]; // weighted points gained/lost per category
  notes: string[];
}

/** Money already left over each month, before any changes. */
export const surplusOf = (row: RankRow) => Math.max(0, row.I - row.S);

/**
 * Extra savings must come from money that's actually left over. The current surplus is the only
 * source counted, so it can't exceed it; spending cuts and income gains already add their own money
 * to the buffer in the scoring engine, so counting them again here would double-count.
 */
export function projectPulse(data: RankData, row: RankRow, ch: PulseChanges, now: { y: number; m: number }): PulseProjection {
  const effectiveSave = Math.min(Math.max(0, ch.save), surplusOf(row));
  const changes: Changes = { save: effectiveSave, cut: -ch.spend, income: ch.income, extraLoan: ch.extraLoan, months: ch.months };
  const p = project(data, row, changes, now);
  const base = scoreFromInputs(row, data.meta);
  const notes = [...p.notes];
  if (ch.save > effectiveSave + 0.5) notes.push(`Savings capped at your current surplus of $${Math.round(surplusOf(row)).toLocaleString("en-CA")}/mo`);
  return {
    score: p.score,
    inputs: p.inputs,
    paidOffAt: p.paidOffAt,
    scored: p.scored,
    base,
    effectiveSave,
    deltas: CATEGORIES.map((k) => ({ key: k, points: data.meta.weights[k] * (p.scored[k] - base[k]) })),
    notes,
  };
}
