import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMetrics, formatRunway, NO_SHOCK, pyRound1, runway, scenario, type MetricsFile } from "./engine";

const root = join(__dirname, "..", "..");
const metrics = decodeMetrics(JSON.parse(readFileSync(join(root, "public", "data", "metrics.json"), "utf8")) as MetricsFile);
type Case = [number, number, number, number, number, number | null];
const golden = JSON.parse(readFileSync(join(root, "..", "pipeline", "golden.json"), "utf8")) as Case[];

describe("pyRound1 matches Python round(x, 1)", () => {
  it.each([
    [2.25, 2.2],
    [2.75, 2.8],
    [0.05, 0.1], // 0.05 is slightly above .05 in binary
    [0.15, 0.1], // 0.15 is slightly below
    [8.649999, 8.6],
    [120, 120],
  ])("round(%s, 1) = %s", (x, want) => expect(pyRound1(x)).toBe(want));
});

describe("runway edge cases", () => {
  it("buffer gone → 0, checked before gap", () => expect(runway(-5, 0, 10, 100)).toBe(0));
  it("no shortfall → null", () => expect(formatRunway(runway(100, 0, 50, 60))).toBe("no shortfall (120+)"));
  it("capped at 120", () => expect(runway(1e9, 0, 2, 1)).toBe(120));
});

describe("golden: TS engine == Python reference for every account and twist", () => {
  it(`all ${golden.length} cases match`, () => {
    const bad: string[] = [];
    for (const [id, mult, bills, extra, oneOffMult, want] of golden) {
      const m = metrics.get(id)!;
      const got = scenario(m, { ...NO_SHOCK, incomePct: mult, jobLoss: mult < 1, billsPct: bills, extraMonthly: extra, oneOffMult }, "judge").runway;
      if (got !== want) bad.push(`${id} ${mult} ${bills} ${extra} ${oneOffMult}: want ${want} got ${got}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(metrics.size).toBe(4500);
  });
});
