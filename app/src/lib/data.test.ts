// Integration tests on REAL account ids from accounts.csv. Each displayed historical number is
// recomputed from the account's own monthly rows (accounts/<id>.json, a copy of monthly_summary.csv)
// and loan record, and the shared resilience score is checked to be the same everywhere.
// pipeline/verify_csv.py does the same check against the raw CSVs for all 4,500 accounts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMetrics, scenario, NO_SHOCK, type MetricsFile } from "./engine";
import { NO_PULSE_CHANGES, projectPulse } from "./pulse";
import { accountLabel, decodeRank, scoreFromInputs } from "./rank";
import { DATA_AS_OF } from "./whatif/scenarios";

const DATA = join(__dirname, "..", "..", "public", "data");
const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const metrics = decodeMetrics(read("metrics.json") as MetricsFile);
const rank = decodeRank(read("rank.json"));

interface Detail {
  id: number;
  loan: { payment: number; status: string } | null;
  owner: Record<string, unknown> | null;
  monthsCols: string[];
  monthsRows: (string | number | null)[][];
}
const detail = (id: number): Detail => read(`accounts/${id}.json`);
const col = (d: Detail, c: string) => d.monthsRows.map((r) => Number(r[d.monthsCols.indexOf(c)] ?? 0));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// featured demo accounts with different profiles, a defaulted running loan (D), and edge cases
const ACCOUNTS = {
  highEarnerThinBuffer: 52783,
  modestIncomeDeepSavings: 97509,
  pensioner: 43402,
  loanOnTheEdge: 76493,
  loanInArrears: 87963,
  negativeBuffer: 32078,
  noSpending: 20578,
  noIncome: 21132,
};

describe("historical values trace back to the monthly records", () => {
  for (const [label, id] of Object.entries(ACCOUNTS)) {
    it(`${label} (#${id}): I, S, H, B, P match the account's own rows`, () => {
      const m = metrics.get(id)!;
      const d = detail(id);
      expect(m, `account ${id} exists`).toBeDefined();
      expect(d.id).toBe(id);
      // rows in the detail file are rounded to cents, so medians agree to a cent
      expect(m.I).toBeCloseTo(median(col(d, "money_in")), 1);
      expect(m.S).toBeCloseTo(median(col(d, "money_out")), 1);
      expect(m.H).toBeCloseTo(median(col(d, "household_bills")), 1);
      expect(m.B).toBeCloseTo(mean(col(d, "avg_daily_balance").slice(-6)), 1);
      const running = d.loan && (d.loan.status === "C" || d.loan.status === "D");
      expect(m.P).toBe(running ? d.loan!.payment : 0);
      // months run in order and end at the data's last month
      const months = d.monthsRows.map((r) => String(r[0]));
      expect([...months].sort()).toEqual(months);
      expect(months[months.length - 1] <= "2025-12").toBe(true);
    });
  }

  it("no names exist anywhere in the account records", () => {
    for (const id of Object.values(ACCOUNTS)) {
      const d = detail(id) as unknown as Record<string, unknown>;
      const keys = JSON.stringify(Object.keys(d)) + JSON.stringify(Object.keys(d.owner ?? {}));
      expect(keys).not.toMatch(/name/i);
    }
  });
});

describe("one score across Rank and Pulse", () => {
  it("rank, metrics and pulse agree on I, S, B for every ranked account", () => {
    for (const r of rank.rows) {
      const m = metrics.get(r.id)!;
      expect(m).toBeDefined();
      expect(Math.abs(m.I - r.I)).toBeLessThan(0.01);
      expect(Math.abs(m.S - r.S)).toBeLessThan(0.01);
      expect(Math.abs(m.B - r.B)).toBeLessThan(0.01);
    }
  });

  it("Tangerine Pulse's starting juice equals the published Rank score", () => {
    for (const id of [52783, 97509, 43402, 76493, 87963]) {
      const row = rank.byId.get(id)!;
      expect(projectPulse(rank, row, NO_PULSE_CHANGES, DATA_AS_OF).score).toBe(row.score);
      expect(Math.abs(scoreFromInputs(row, rank.meta).score - row.score)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });

  it("a hypothetical change never alters the stored original score", () => {
    const row = rank.byId.get(52783)!;
    const before = row.score;
    const p = projectPulse(rank, row, { ...NO_PULSE_CHANGES, spend: -500 }, DATA_AS_OF);
    expect(p.score).toBeGreaterThan(before);
    expect(row.score).toBe(before);
  });
});

describe("invalid and insufficient-data cases are handled honestly", () => {
  it("accounts without enough activity are excluded from ranking with a reason, never scored", () => {
    for (const id of [ACCOUNTS.noSpending, ACCOUNTS.noIncome]) {
      expect(rank.byId.has(id)).toBe(false);
      expect(rank.excluded.get(id)).toMatch(/No regular/);
    }
    expect(rank.rows.length + rank.excluded.size).toBe(4500);
  });

  it("an id that isn't in accounts.csv resolves to nothing", () => {
    expect(metrics.has(12345)).toBe(false);
    expect(rank.byId.has(12345) || rank.excluded.has(12345)).toBe(false);
  });

  it("a negative buffer gives zero runway rather than an invented one", () => {
    const m = metrics.get(ACCOUNTS.negativeBuffer)!;
    expect(m.B).toBeLessThan(0);
    expect(scenario(m, NO_SHOCK).runway).toBe(0);
  });

  it("leaderboard labels are real account ids", () => {
    expect(accountLabel(rank.rows[0].id)).toBe(`Account #${rank.rows[0].id}`);
    expect(metrics.has(rank.rows[0].id)).toBe(true);
  });
});
