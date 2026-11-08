import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NO_SHOCK, decodeMetrics, type MetricsFile, type Mode, type Shock } from "./engine";
import { FIELDS, SHOCK_PRESETS, clampShock } from "./shocks";
import { monthlyBridge, planDefs, recoveryInputs, simulateRecovery } from "./recovery";

const file = join(__dirname, "../../public/data/metrics.json");
const customers = existsSync(file) ? [...decodeMetrics(JSON.parse(readFileSync(file, "utf8")) as MetricsFile).values()] : [];

const shocks: Shock[] = [
  { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 }, // the default shown when nothing is set up
  { ...NO_SHOCK, incomePct: 0.7, billsPct: 0.15, extraMonthly: 200, durationMonths: 12 },
  { ...NO_SHOCK, oneOffMult: 2, durationMonths: 6 },
  { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, oneOffAbs: 250000, durationMonths: 3 }, // one-time cost bigger than most accounts
];

describe.skipIf(customers.length === 0)("recovery model on every customer in the dataset", () => {
  it("never produces NaN, negative money or a negative unpaid amount, for any plan, mode or what-if", () => {
    let runs = 0;
    for (const m of customers) {
      for (const shock of shocks) {
        for (const mode of ["judge", "realistic"] as Mode[]) {
          for (const plan of planDefs(m)) {
            const r = simulateRecovery(recoveryInputs(m, shock, mode, plan, { targetMonths: 3 }));
            runs++;
            if (r.rows.length !== 97) throw new Error(`customer ${m.id}: expected 97 rows`);
            for (const row of r.rows) {
              if (!(row.funds >= 0 && row.gap >= 0 && Number.isFinite(row.net))) throw new Error(`customer ${m.id} plan ${plan.key}: bad row ${JSON.stringify(row)}`);
            }
          }
        }
      }
    }
    expect(runs).toBeGreaterThan(100000);
  }, 120_000);

  it("the monthly bridge always agrees with the simulation's first month", () => {
    for (const m of customers) {
      for (const plan of planDefs(m)) {
        const shock = shocks[0];
        const bridge = monthlyBridge(m, shock, "judge", plan);
        const first = simulateRecovery(recoveryInputs(m, shock, "judge", plan, { targetMonths: 3 })).rows[1];
        if (Math.abs(bridge.netWithPlan - first.net) > 0.01) throw new Error(`customer ${m.id} plan ${plan.key}: bridge ${bridge.netWithPlan} vs simulation ${first.net}`);
      }
    }
  });

  it("a plan never makes the first month worse than doing nothing", () => {
    for (const m of customers) {
      const none = planDefs(m)[0];
      for (const plan of planDefs(m)) {
        const a = monthlyBridge(m, shocks[0], "judge", none).netWithPlan;
        const b = monthlyBridge(m, shocks[0], "judge", plan).netWithPlan;
        if (b < a - 0.01) throw new Error(`customer ${m.id} plan ${plan.key} is worse than no changes`);
      }
    }
  });
});

// Everything the What if? page can hand to the Recovery Plan: every library preset (some are built from the
// customer's own numbers) and the extreme corners of every field the user can type into.
describe.skipIf(customers.length === 0)("recovery model with everything the What if? page can produce", () => {
  const sample = customers.filter((_, i) => i % 15 === 0);
  const shocksFor = (m: (typeof customers)[number]): Shock[] => {
    const lib = SHOCK_PRESETS.map((p) => p.build(m));
    const corners: Shock[] = [];
    const lows = Object.fromEntries(FIELDS.map((f) => [f.key, f.min / f.scale]));
    const highs = Object.fromEntries(FIELDS.map((f) => [f.key, f.max / f.scale]));
    for (let mask = 0; mask < 64; mask++) {
      const pick = (hi: boolean, key: (typeof FIELDS)[number]["key"]) => (hi ? highs[key] : lows[key]);
      corners.push(
        clampShock({
          jobLoss: mask % 2 === 1,
          incomePct: pick(!!(mask & 2), "incomePct"),
          billsPct: pick(!!(mask & 4), "billsPct"),
          extraMonthly: pick(!!(mask & 8), "extraMonthly"),
          oneOffMult: pick(!!(mask & 16), "oneOffMult"),
          oneOffAbs: pick(!!(mask & 32), "oneOffAbs"),
          durationMonths: mask & 1 ? 24 : 1,
        }),
      );
    }
    return [...lib, ...corners];
  };

  it("never throws or produces NaN, and the monthly bridge always matches the simulation", () => {
    for (const m of sample) {
      for (const shock of shocksFor(m)) {
        for (const mode of ["judge", "realistic"] as Mode[]) {
          for (const plan of planDefs(m)) {
            let r;
            try {
              r = simulateRecovery(recoveryInputs(m, shock, mode, plan, { targetMonths: 3 }));
              monthlyBridge(m, shock, mode, plan);
            } catch (e) {
              throw new Error(`customer ${m.id}, plan ${plan.key}, ${mode}, shock ${JSON.stringify(shock)}: ${(e as Error).message}`);
            }
            if (!Number.isFinite(r.gapAtDisruptionEnd) || !Number.isFinite(r.peakGap)) throw new Error(`customer ${m.id}: non-finite result for ${JSON.stringify(shock)}`);
            for (const row of r.rows) if (!(row.funds >= 0 && row.gap >= 0 && Number.isFinite(row.net))) throw new Error(`customer ${m.id}: bad row for ${JSON.stringify(shock)}`);
            const bridge = monthlyBridge(m, shock, mode, plan);
            if (Math.abs(bridge.netWithPlan - r.rows[1].net) > 0.01) throw new Error(`customer ${m.id}, plan ${plan.key}, ${mode}: bridge ${bridge.netWithPlan} vs simulation ${r.rows[1].net} for ${JSON.stringify(shock)}`);
          }
        }
      }
    }
  }, 120_000);
});
