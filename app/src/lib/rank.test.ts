import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alias, decodeRank, leagueOfRank, leverToReach, nextLeague, NO_CHANGES, project, rankOf, round1, scoreFromInputs } from "./rank";

const data = decodeRank(JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "rank.json"), "utf8")));
const now = { y: 2026, m: 11 };

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

  it("aliases are stable and don't reveal the account id", () => {
    expect(alias(20134)).toBe(alias(20134));
    expect(alias(20134)).not.toContain("20134");
    const names = new Set(data.rows.map((r) => alias(r.id)));
    expect(names.size).toBeGreaterThan(data.rows.length * 0.97);
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
