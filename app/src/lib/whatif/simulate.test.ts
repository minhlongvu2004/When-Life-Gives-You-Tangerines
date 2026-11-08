import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMetrics, type Metrics, type MetricsFile } from "../engine";
import { BAD_DEFAULT, SCENARIOS, SCENARIO_BY_KIND, WELL_DEFAULT, badDefaults, payment, type Assumptions, type Compiled } from "./scenarios";
import { extraNeeded, simulate, summarize, milestones, type Goal } from "./simulate";
import { guidance, story } from "./story";

const now = { y: 2026, m: 11 };
const flat: Assumptions = { delayMonths: 0, upsidePct: 100, costPct: 100, expensePct: 100, inflationPct: 0 };
const m: Metrics = {
  id: 1, I: 5000, F: 1500, S: 4000, B: 10000, H: 1200, P: 0, ins: 0, loanPay: 0, disc: 1500, card: 0, cash: 1500, xfer: 0,
  fees: 0, pension: 0, nonPensionI: 5000, region: "x", incomeCV: null, months: 30,
};
const none: Compiled = { start: 1, streams: [], oneOffs: [], events: [], derived: [] };
const goal = (p: Partial<Goal>): Goal => ({ id: "g", template: "custom", name: "Goal", target: 1000, targetDate: "2027-11", priority: "medium", spend: false, ...p });

describe("simulate", () => {
  it("carries the surplus forward month by month", () => {
    const f = simulate({ m, compiled: none, a: flat, goals: [], now, loanEndsAt: null });
    expect(f.points[0].balance).toBe(10000);
    expect(f.points[12].balance).toBe(10000 + 12 * 1000);
  });

  it("respects the start date and one-off costs", () => {
    const c: Compiled = { ...none, start: 3, streams: [{ label: "x", kind: "expense", amount: 500, from: 3 }], oneOffs: [{ label: "y", amount: -2000, at: 3 }] };
    const f = simulate({ m, compiled: c, a: flat, goals: [], now, loanEndsAt: null });
    expect(f.points[2].balance).toBe(12000);
    expect(f.points[3].balance).toBe(12000 + 500 - 2000);
  });

  it("never counts the same dollar toward two goals", () => {
    const goals = [goal({ id: "a", target: 8000, priority: "high" }), goal({ id: "b", target: 8000, priority: "low" })];
    const f = simulate({ m, compiled: none, a: flat, goals, now, loanEndsAt: null });
    for (const p of f.points) expect(p.goals.a + p.goals.b).toBeLessThanOrEqual(Math.max(0, p.balance) + 1e-6);
    expect(f.goals[0].reachedAt).toBe(0); // 10K buffer already covers the high-priority goal
    expect(f.goals[1].reachedAt).toBe(6); // the low-priority one waits for 16K
  });

  it("spends purchase goals when funded", () => {
    const f = simulate({ m, compiled: none, a: flat, goals: [goal({ target: 12000, spend: true })], now, loanEndsAt: null });
    expect(f.goals[0].reachedAt).toBe(2);
    expect(f.points[2].balance).toBe(12000 - 12000);
  });

  it("the bad future delays gains and inflates costs", () => {
    const job = SCENARIO_BY_KIND.job;
    const v = { ...job.defaults(m, now), salary: 6000, start: "2027-01", transition: 1000, extra: 0, relocation: 0 };
    const c = job.compile(v, m, now);
    const well = simulate({ m, compiled: c, a: flat, goals: [], now, loanEndsAt: null });
    const bad = simulate({ m, compiled: c, a: { ...flat, delayMonths: 2, costPct: 150 }, goals: [], now, loanEndsAt: null });
    expect(well.points[2].income).toBe(6000);
    expect(bad.points[2].income).toBe(0); // old pay stopped, new pay not started yet
    expect(bad.points[4].income).toBe(6000);
    expect(bad.points[2].oneOff).toBe(-1500);
  });

  it("pays off the existing loan at its real end date", () => {
    const withLoan = { ...m, P: 800 };
    const f = simulate({ m: withLoan, compiled: none, a: flat, goals: [], now, loanEndsAt: 4 });
    expect(f.points[4].expenses).toBe(4000);
    expect(f.points[5].expenses).toBe(3200);
  });

  it("finds the extra saving needed to hit a late goal", () => {
    const g = goal({ target: 20000, targetDate: "2027-05" }); // 6 months away; needs 10K more → ≈ 1,667/mo
    const input = { m, compiled: none, a: flat, goals: [g], now, loanEndsAt: null };
    expect(simulate(input).goals[0].reachedAt).toBe(10);
    const x = extraNeeded(input, "g")!;
    expect(x).toBeGreaterThanOrEqual(666);
    expect(x).toBeLessThan(700);
  });

  it("mortgage payment formula", () => {
    expect(payment(100000, 0, 100)).toBe(1000);
    expect(Math.round(payment(427500, 4.5, 300))).toBe(2376);
  });
});

describe("every scenario runs on real customers", () => {
  const metrics = decodeMetrics(JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "public", "data", "metrics.json"), "utf8")) as MetricsFile);
  const sample = [...metrics.values()].filter((_, i) => i % 450 === 0);
  it.each(SCENARIOS.map((s) => [s.kind]))("%s", (kind) => {
    const def = SCENARIO_BY_KIND[kind as keyof typeof SCENARIO_BY_KIND];
    for (const cm of sample) {
      const v = def.defaults(cm, now);
      const c = def.compile(v, cm, now);
      const goals = [goal({ id: "e", target: 3 * cm.S, priority: "high" }), goal({ id: "c", target: 20000, spend: true, template: "car" })];
      const well = simulate({ m: cm, compiled: c, a: WELL_DEFAULT, goals, now, loanEndsAt: null });
      const bad = simulate({ m: cm, compiled: c, a: { ...BAD_DEFAULT, ...badDefaults(def.kind) }, goals, now, loanEndsAt: null });
      for (const f of [well, bad]) for (const p of f.points) expect(Number.isFinite(p.balance)).toBe(true);
      const ctx = { def, decision: def.decision(v, cm, now), m: cm, now, h: 12, well, bad };
      expect(story("well", ctx)).toHaveLength(4);
      expect(story("bad", ctx).every((ch) => ch.text.length > 0 && !ch.text.includes("NaN"))).toBe(true);
      const gd = guidance(ctx);
      expect(gd.bad.length).toBeGreaterThan(0);
      expect(JSON.stringify(gd)).not.toContain("NaN");
      expect(summarize(bad, 36).h).toBe(36);
      expect(milestones(well, 36, def.short).every((x) => x.t >= 1 && x.t <= 36)).toBe(true);
    }
  });
});
