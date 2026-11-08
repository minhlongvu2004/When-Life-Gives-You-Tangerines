import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accountLabel, decodeRank, leagueOfRank, leverToReach, loanMonthsLeft, nextLeague, NO_CHANGES, project, rankOf, round1, scoreFromInputs } from "./rank";
import { DATA_AS_OF } from "./whatif/scenarios";

const data = decodeRank(JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "rank.json"), "utf8")));
const now = DATA_AS_OF;

describe("precomputed ranking is internally consistent", () => {
  it("covers every account exactly once", () => {
    expect(data.rows.length + data.excluded.size).toBe(data.meta.total);
    for (const r of data.rows) expect(data.excluded.has(r.id)).toBe(false);
  });

  it("browser scoring reproduces every published score", () => {
    let worst = 0;
    for (const r of data.rows) worst = Math.max(worst, Math.abs(scoreFromInputs(r, data.meta).score - r.score));
    expect(worst).toBeLessThanOrEqual(0.05 + 1e-9); // only the 1-decimal rounding differs
  });

  it("ranks follow the sorted scores with shared ranks for ties", () => {
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      if (i) expect(r.score).toBeLessThanOrEqual(data.rows[i - 1].score);
      expect(rankOf(data, r.score, r)).toBe(r.rank);
      expect(r.rank).toBe(1 + data.rows.filter((x) => x.score > r.score).length);
    }
  });

  it("leagues match the published thresholds and shares", () => {
    for (const r of data.rows) {
      const L = leagueOfRank(data.meta, r.rank);
      expect(r.score).toBeGreaterThanOrEqual(data.meta.thresholds[L].minScore);
    }
    expect(data.meta.thresholds.diamond.maxRank).toBeLessThanOrEqual(Math.ceil(0.05 * data.meta.n));
  });

  it("leaderboard labels are the real account ids, never invented names", () => {
    expect(accountLabel(20134)).toBe("Account #20134");
    const names = new Set(data.rows.map((r) => accountLabel(r.id)));
    expect(names.size).toBe(data.rows.length);
  });

  it("every loan counted as running in the score still has payments left at the data's end (Dec 2025)", () => {
    const running = data.rows.filter((r) => r.P > 0);
    expect(running.length).toBeGreaterThan(100);
    for (const r of running) expect(loanMonthsLeft(r, DATA_AS_OF)).toBeGreaterThan(0);
  });
});

describe("hypothetical projections", () => {
  const sample = data.rows.filter((_, i) => i % 97 === 0);

  it("no changes reproduces the current score and rank", () => {
    for (const r of sample) {
      const p = project(data, r, NO_CHANGES, now);
      expect(p.score).toBe(r.score);
      expect(p.rank).toBe(r.rank);
    }
  });

  it("extra saving only moves the buffer category", () => {
    for (const r of sample) {
      const base = scoreFromInputs(r, data.meta);
      const p = project(data, r, { ...NO_CHANGES, save: 500 }, now);
      expect(p.scored.cashflow).toBeCloseTo(base.cashflow, 9);
      expect(p.scored.stability).toBeCloseTo(base.stability, 9);
      expect(p.scored.debt).toBeCloseTo(base.debt, 9);
      expect(p.scored.buffer).toBeGreaterThanOrEqual(base.buffer);
      expect(p.rank).toBeLessThanOrEqual(r.rank);
    }
  });

  it("a lever found to reach the next league really does", () => {
    let checked = 0;
    for (const r of sample) {
      const nl = nextLeague(data, r);
      if (!nl.needScore) continue;
      const v = leverToReach(data, r, "save", nl.needScore, 12, 3 * Math.max(r.I, r.S), now);
      if (v === null) continue;
      const p = project(data, r, { ...NO_CHANGES, save: v }, now);
      expect(p.score).toBeGreaterThanOrEqual(nl.needScore);
      expect(p.league).toBe(nl.next);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("round1 matches Python rounding at display precision", () => {
    expect(round1(67.85000001)).toBe(67.9);
    expect(round1(55)).toBe(55);
  });
});
