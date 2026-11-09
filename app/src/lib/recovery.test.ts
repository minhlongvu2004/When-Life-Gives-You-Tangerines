import { describe, expect, it } from "vitest";
import { simulateRecovery, type RecoveryInputs } from "./recovery";

// The fictional household from the design walkthrough (not a dataset customer):
// $6,000 in the account, $4,800 usual money in, $2,200 essentials we can see, $2,100 other spending.
// Job loss: EI estimate of $2,640 (55% x $4,800) for months 1-6, then income and spending return to normal.
const base: RecoveryInputs = {
  startFunds: 6000,
  startGap: 0,
  durationMonths: 6,
  incomeDuring: 2640,
  incomeAfter: 4800,
  spendingDuring: 4300,
  spendingAfter: 4300,
  deferralPerMonth: 0,
  starter: 2200,
  target: 6600,
};
const planA = { ...base, spendingDuring: 4300 - 210 }; // trim 10% of the $2,100
const planB = { ...base, spendingDuring: 4300 - 210 - 350, deferralPerMonth: 350 }; // + loan deferral
const planC = { ...base, spendingDuring: 4300 - 525 - 350, deferralPerMonth: 350 }; // trim 25% + deferral

describe("simulateRecovery: walkthrough household", () => {
  it("no changes: money runs out in month 4 and the unpaid amount builds to $3,960", () => {
    const r = simulateRecovery(base);
    expect(r.rows[3].funds).toBeCloseTo(1020);
    expect(r.rows[4]).toMatchObject({ funds: 0 });
    expect(r.rows[4].gap).toBeCloseTo(640);
    expect(r.rows[6].gap).toBeCloseTo(3960);
    expect(r.rows[7].gap).toBeCloseTo(3710); // month 7: half of the $500 leftover goes to the unpaid amount
    expect(r).toMatchObject({ runsOutMonth: 4, shortfallEndsMonth: 7, caughtUpMonth: 22, backToStarterMonth: 31, targetMonth: 49 });
    expect(r.peakGap).toBeCloseTo(3960);
  });

  it("plan A (trim 10%): runs out in month 5, target in month 44", () => {
    const r = simulateRecovery(planA);
    expect(r).toMatchObject({ runsOutMonth: 5, caughtUpMonth: 17, backToStarterMonth: 26, targetMonth: 44 });
    expect(r.peakGap).toBeCloseTo(2700);
  });

  it("plan B (trim 10% + defer loan): $600 uncovered in month 6, deferral repaid at $175 a month", () => {
    const r = simulateRecovery(planB);
    expect(r.rows[5].funds).toBeCloseTo(500);
    expect(r.rows[6]).toMatchObject({ funds: 0 });
    expect(r.rows[6].gap).toBeCloseTo(600);
    expect(r.rows[7].repay).toBeCloseTo(175); // $350 x 6 months / 12
    expect(r.rows[7].net).toBeCloseTo(325); // $500 leftover - $175 catch-up
    expect(r.rows[18].repay).toBeCloseTo(175);
    expect(r.rows[19].repay).toBe(0);
    expect(r.rows[19].funds).toBeCloseTo(1600);
    expect(r).toMatchObject({ runsOutMonth: 6, caughtUpMonth: 10, backToStarterMonth: 22, targetMonth: 39 });
    expect(r.peakGap).toBeCloseTo(600);
  });

  it("plan C (trim 25% + defer): never runs out, and the target is reached in month 32", () => {
    const r = simulateRecovery(planC);
    expect(r.rows[6].funds).toBeCloseTo(1290);
    expect(r).toMatchObject({ runsOutMonth: null, caughtUpMonth: null, backToStarterMonth: 12, targetMonth: 32 });
    expect(r.peakGap).toBe(0);
  });

  it("changing an assumption: disruption of 9 months (plan B)", () => {
    const r = simulateRecovery({ ...planB, durationMonths: 9 });
    expect(r.peakGap).toBeCloseTo(3900);
    expect(r).toMatchObject({ caughtUpMonth: 31, targetMonth: 58 });
  });

  it("changing an assumption: lender refuses the deferral (plan B without it)", () => {
    const r = simulateRecovery({ ...planB, spendingDuring: 4300 - 210, deferralPerMonth: 0 });
    expect(r).toMatchObject({ runsOutMonth: 5, targetMonth: 44 });
    expect(r.peakGap).toBeCloseTo(2700);
  });

  it("changing an assumption: rebuild share", () => {
    expect(simulateRecovery({ ...planB, rebuildShare: 0.75 }).targetMonth).toBe(30);
    expect(simulateRecovery({ ...planB, rebuildShare: 1 }).targetMonth).toBe(25);
  });
});

describe("simulateRecovery: rules that must always hold", () => {
  // a small deterministic generator so the cases are repeatable
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const cases: RecoveryInputs[] = Array.from({ length: 300 }, () => ({
    startFunds: Math.round(rnd() * 20000),
    startGap: rnd() < 0.2 ? Math.round(rnd() * 3000) : 0,
    durationMonths: 1 + Math.floor(rnd() * 24),
    incomeDuring: Math.round(rnd() * 6000),
    incomeAfter: Math.round(rnd() * 7000),
    spendingDuring: Math.round(1000 + rnd() * 5000),
    spendingAfter: Math.round(1000 + rnd() * 5000),
    deferralPerMonth: rnd() < 0.4 ? Math.round(rnd() * 800) : 0,
    starter: Math.round(500 + rnd() * 3000),
    target: Math.round(3000 + rnd() * 15000),
    rebuildShare: [0.25, 0.5, 0.75, 1][Math.floor(rnd() * 4)],
  }));

  it("available money is never negative and the unpaid amount is never negative", () => {
    for (const c of cases) for (const row of simulateRecovery(c).rows) {
      expect(row.funds).toBeGreaterThanOrEqual(0);
      expect(row.gap).toBeGreaterThanOrEqual(0);
    }
  });

  it("nothing is saved in a month with a shortfall, and money is never created", () => {
    for (const c of cases) {
      const share = c.rebuildShare ?? 0.5;
      const { rows } = simulateRecovery(c);
      for (let t = 1; t < rows.length; t++) {
        const dFunds = rows[t].funds - rows[t - 1].funds;
        const dGap = rows[t].gap - rows[t - 1].gap;
        if (rows[t].net < 0) {
          expect(dFunds).toBeLessThanOrEqual(1e-6); // funds only fall
          expect(dGap).toBeGreaterThanOrEqual(-1e-6); // unpaid amount only grows
        } else {
          // what goes to savings plus what clears the unpaid amount cannot exceed the share of the leftover
          expect(dFunds - dGap).toBeLessThanOrEqual(rows[t].net * share + 1e-6);
        }
      }
    }
  });

  it("a target is never reported while something is still unpaid", () => {
    for (const c of cases) {
      const r = simulateRecovery(c);
      if (r.targetMonth !== null) {
        expect(r.rows[r.targetMonth].gap).toBe(0);
        expect(r.rows[r.targetMonth].funds).toBeGreaterThanOrEqual(c.target);
      }
    }
  });
});

describe("simulateRecovery: what is uncovered when the disruption ends", () => {
  it("is reported separately from the long-run peak", () => {
    expect(simulateRecovery(base).gapAtDisruptionEnd).toBeCloseTo(3960);
    // if normal income never covers normal spending, the unpaid amount keeps growing for years afterwards,
    // but what was uncovered at the end of the disruption doesn't change
    const permanent = simulateRecovery({ ...base, incomeAfter: 4000, spendingAfter: 4300 });
    expect(permanent.gapAtDisruptionEnd).toBeCloseTo(3960);
    expect(permanent.peakGap).toBeGreaterThan(20000);
  });
  it("is zero when the account covers the whole disruption", () => {
    expect(simulateRecovery(planC).gapAtDisruptionEnd).toBe(0);
  });
});

describe("simulateRecovery: odd inputs never throw", () => {
  it("copes with a fractional, missing or huge duration", () => {
    for (const durationMonths of [6.5, 0, -3, NaN, Infinity, 500]) {
      const r = simulateRecovery({ ...base, durationMonths });
      expect(r.rows).toHaveLength(97);
      expect(Number.isFinite(r.gapAtDisruptionEnd)).toBe(true);
    }
  });
  it("treats non-finite money values as zero instead of producing NaN", () => {
    const r = simulateRecovery({ ...base, startFunds: NaN, incomeDuring: Infinity, spendingAfter: NaN, deferralPerMonth: NaN });
    for (const row of r.rows) expect(Number.isFinite(row.funds) && Number.isFinite(row.gap) && Number.isFinite(row.net)).toBe(true);
  });
});

describe("simulateRecovery: edge cases", () => {
  it("if normal income doesn't cover normal spending, nothing is ever rebuilt", () => {
    const r = simulateRecovery({ ...base, incomeAfter: 4000, spendingAfter: 4300 });
    expect(r.shortfallEndsMonth).toBeNull();
    expect(r.targetMonth).toBeNull();
    expect(r.backToStarterMonth).toBeNull();
  });

  it("one-time costs bigger than the account start as an unpaid amount in month 0", () => {
    const r = simulateRecovery({ ...base, startFunds: 0, startGap: 500, incomeDuring: 4800, spendingDuring: 4300 });
    expect(r.runsOutMonth).toBe(0);
    expect(r.rows[0]).toMatchObject({ funds: 0, gap: 500 });
    expect(r.caughtUpMonth).toBe(2); // $250 a month (half the $500 leftover) clears $500
  });

  it("no disruption and plenty of money: the target is already met", () => {
    const r = simulateRecovery({ ...base, startFunds: 9000, incomeDuring: 4800, spendingDuring: 4300 });
    expect(r).toMatchObject({ runsOutMonth: null, shortfallEndsMonth: 0, backToStarterMonth: 0, targetMonth: 0 });
    expect(r.peakGap).toBe(0);
  });

  it("an income that never covers essentials leaves the account at zero and the unpaid amount growing", () => {
    const r = simulateRecovery({ ...base, incomeAfter: 1000, spendingAfter: 3000, horizon: 24 });
    expect(r.rows[24].funds).toBe(0);
    expect(r.rows[24].gap).toBeGreaterThan(r.rows[12].gap);
    expect(r.targetMonth).toBeNull();
  });
});

// ---------------------------------------------------------------- from a customer's numbers

import { NO_SHOCK, type Metrics, type Shock } from "./engine";
import { durationWords, essentialsBasis, monthlyBridge, planDefs, recoveryInputs, roundedMoney } from "./recovery";

const m: Metrics = {
  id: 1, I: 4800, F: 2200, S: 4300, B: 6000, H: 1700, P: 350, ins: 150, loanPay: 350, disc: 2100,
  card: 700, cash: 700, xfer: 700, fees: 0, pension: 0, nonPensionI: 4800, lean: 2100, unemp: 5, region: "test", incomeCV: null, months: 36,
};
const jobLoss: Shock = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };
const plan = (mm: Metrics, key: string) => planDefs(mm).find((p) => p.key === key)!;

describe("planDefs", () => {
  it("offers three plans plus 'no changes' when there is flexible spending and a running loan", () => {
    expect(planDefs(m).map((p) => p.key)).toEqual(["none", "A", "B", "C"]);
    expect(plan(m, "B")).toMatchObject({ trimPct: 0.1, deferral: true });
    expect(plan(m, "C")).toMatchObject({ trimPct: 0.25, deferral: true });
    expect(plan(m, "A").deferral).toBe(false);
  });
  it("without a loan, no plan relies on a deferral", () => {
    const defs = planDefs({ ...m, P: 0 });
    expect(defs.map((p) => p.key)).toEqual(["none", "A", "B", "C"]);
    expect(defs.every((p) => !p.deferral)).toBe(true);
    expect(plan({ ...m, P: 0 }, "B").trimPct).toBe(0.15);
  });
  it("without flexible spending but with a loan, the only plan is asking the lender", () => {
    expect(planDefs({ ...m, disc: 0 }).map((p) => p.key)).toEqual(["none", "A"]);
    expect(plan({ ...m, disc: 0 }, "A").deferral).toBe(true);
  });
  it("with neither, nothing can be modelled beyond 'no changes'", () => {
    expect(planDefs({ ...m, disc: 0, P: 0 }).map((p) => p.key)).toEqual(["none"]);
  });
});

describe("recoveryInputs", () => {
  it("reproduces the walkthrough for plan B from the customer's numbers", () => {
    const i = recoveryInputs(m, jobLoss, "judge", plan(m, "B"), { targetMonths: 3 });
    expect(i).toMatchObject({ startFunds: 6000, startGap: 0, durationMonths: 6, incomeDuring: 2640, incomeAfter: 4800, spendingAfter: 4300, deferralPerMonth: 350, starter: 2200, target: 6600 });
    expect(i.spendingDuring).toBeCloseTo(3740);
    const r = simulateRecovery(i);
    expect(r).toMatchObject({ runsOutMonth: 6, caughtUpMonth: 10, targetMonth: 39 });
  });
  it("'the lender says no' removes the deferral", () => {
    const i = recoveryInputs(m, jobLoss, "judge", plan(m, "B"), { targetMonths: 3, deferralRefused: true });
    expect(i.deferralPerMonth).toBe(0);
    expect(i.spendingDuring).toBeCloseTo(4090);
  });
  it("'lasts longer' extends the disruption; the 6-month stretch doubles the target", () => {
    const i = recoveryInputs(m, jobLoss, "judge", plan(m, "A"), { targetMonths: 6, extraMonths: 3 });
    expect(i.durationMonths).toBe(9);
    expect(i.target).toBe(13200);
  });
  it("one-time costs bigger than the account start as an unpaid amount", () => {
    const i = recoveryInputs(m, { ...NO_SHOCK, oneOffAbs: 7500 }, "judge", plan(m, "none"), { targetMonths: 3 });
    expect(i).toMatchObject({ startFunds: 0, startGap: 1500 });
  });
  it("uses all spending as the essentials basis when no bills are labelled", () => {
    expect(essentialsBasis({ ...m, F: 0 })).toEqual({ monthly: 4300, labelled: false });
    expect(essentialsBasis(m)).toEqual({ monthly: 2200, labelled: true });
  });
});

describe("monthlyBridge", () => {
  it("shows money in, what goes out, and what each change does", () => {
    const b = monthlyBridge(m, jobLoss, "judge", plan(m, "B"));
    expect(b.rows.map((r) => [r.key, Math.round(r.value)])).toEqual([
      ["in", 2640], ["ess", -2200], ["other", -2100], ["none", -1660], ["trim", 210], ["defer", 350], ["plan", -1100],
    ]);
    expect(b.netNoChange).toBeCloseTo(-1660);
    expect(b.netWithPlan).toBeCloseTo(-1100);
  });
  it("matches the simulation's monthly gap during the disruption", () => {
    for (const key of ["none", "A", "B", "C"]) {
      const p = plan(m, key);
      const r = simulateRecovery(recoveryInputs(m, jobLoss, "judge", p, { targetMonths: 3 }));
      expect(monthlyBridge(m, jobLoss, "judge", p).netWithPlan).toBeCloseTo(r.rows[1].net);
    }
  });
  it("adds a row for higher bills and new costs", () => {
    const b = monthlyBridge(m, { ...jobLoss, billsPct: 0.1, extraMonthly: 100 }, "judge", plan(m, "none"));
    expect(b.rows.find((r) => r.key === "new")!.value).toBeCloseTo(-270);
  });
});

describe("wording helpers", () => {
  it("rounds dollars to a sensible precision", () => {
    expect(roundedMoney(1662)).toBe("$1,700");
    expect(roundedMoney(-638)).toBe("−$640");
    expect(roundedMoney(87)).toBe("$90");
  });
  it("describes durations in plain words", () => {
    expect(durationWords(null)).toBe("not within 8 years");
    expect(durationWords(0)).toBe("already there");
    expect(durationWords(1)).toBe("1 month");
    expect(durationWords(12)).toBe("12 months");
    expect(durationWords(39)).toBe("about 3 years 3 months");
    expect(durationWords(49)).toBe("about 4 years"); // rounds to the nearest 3 months
    expect(durationWords(50)).toBe("about 4 years 3 months");
  });
});
