import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMetrics, NO_SHOCK, pyRound1, scenario, type Metrics, type MetricsFile, type Shock } from "./engine";
import { clampShock, FIELD, FIELDS, projectShock, sameShock, SHOCK_PRESETS, validateField } from "./shocks";

const root = join(__dirname, "..", "..");
const metrics = decodeMetrics(JSON.parse(readFileSync(join(root, "public", "data", "metrics.json"), "utf8")) as MetricsFile);
const all = [...metrics.values()];
const start = { y: 2026, m: 11 };

// a made-up customer with round numbers, so expected values can be worked out by hand
const toy: Metrics = { ...all[0], id: -1, I: 4000, S: 3500, B: 9000, H: 1000, F: 1500, disc: 1200, ins: 200, P: 0, pension: 0, nonPensionI: 4000 };

describe("preset library", () => {
  it("keeps the brief's four twist scenarios exactly as before", () => {
    const by = Object.fromEntries(SHOCK_PRESETS.map((p) => [p.key, p.build(toy)]));
    expect(by.job).toEqual({ ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 });
    expect(by.furnace).toEqual({ ...NO_SHOCK, oneOffMult: 1 });
    expect(by.combo).toEqual({ ...NO_SHOCK, jobLoss: true, incomePct: 0.55, billsPct: 0.15, durationMonths: 6 });
    expect(by.rent).toEqual({ ...NO_SHOCK, billsPct: 0.15, durationMonths: 12 });
    expect(SHOCK_PRESETS.filter((p) => p.datathon).map((p) => p.key).sort()).toEqual(["combo", "furnace", "job", "rent"]);
  });

  it("every preset stays inside the field limits for every customer", () => {
    for (const m of all.slice(0, 300))
      for (const p of SHOCK_PRESETS) {
        const s = p.build(m);
        expect(sameShock(clampShock(s), s), `${p.key} for #${m.id}`).toBe(true);
      }
  });

  it("has unique keys: the 25 requested scenarios plus the brief's rent +15% twist", () => {
    expect(new Set(SHOCK_PRESETS.map((p) => p.key)).size).toBe(SHOCK_PRESETS.length);
    expect(SHOCK_PRESETS.length).toBe(26);
  });

  it("customer-based presets use the customer's own spending", () => {
    const g = SHOCK_PRESETS.find((p) => p.key === "groceries")!.build(toy);
    const ins = SHOCK_PRESETS.find((p) => p.key === "insurance")!.build(toy);
    expect(g.extraMonthly).toBe(100); // 10% of $1,200 flexible spending, to the nearest $50
    expect(ins.extraMonthly).toBe(40); // 20% of $200 insurance
  });
});

describe("README formulas", () => {
  it("bills change applies to household bills only, not all spending", () => {
    const sc = scenario(toy, { ...NO_SHOCK, billsPct: 0.15 }, "judge");
    expect(sc.spending).toBeCloseTo(3500 + 0.15 * 1000);
  });

  it("combined custom shock: Moving During a Job Loss", () => {
    const s: Shock = { ...NO_SHOCK, incomePct: 0.55, billsPct: 0.15, extraMonthly: 200, oneOffAbs: 1500, durationMonths: 6 };
    const sc = scenario(toy, s, "judge");
    expect(sc.income).toBeCloseTo(2200); // 4000 × 55%
    expect(sc.spending).toBeCloseTo(3500 + 150 + 200); // S + 15% × H + extra, nothing counted twice
    expect(sc.oneOff).toBeCloseTo(1500);
    expect(sc.bufferLeft).toBeCloseTo(7500);
    expect(sc.runway).toBe(pyRound1(7500 / (3850 - 2200)));
  });

  it("one-off costs combine the multiplier and the dollar amount", () => {
    expect(scenario(toy, { ...NO_SHOCK, oneOffMult: 2, oneOffAbs: 500 }, "judge").oneOff).toBeCloseTo(2 * 3500 + 500);
  });

  it("runway is zero when one-off costs empty the buffer, and capped at 120", () => {
    expect(scenario(toy, { ...NO_SHOCK, oneOffAbs: 9000 }, "judge").runway).toBe(0);
    expect(scenario({ ...toy, B: 1e9 }, { ...NO_SHOCK, incomePct: 0.5 }, "judge").runway).toBe(120);
  });
});

describe("duration-aware projection", () => {
  const s: Shock = { ...NO_SHOCK, incomePct: 0.55, oneOffAbs: 1000, durationMonths: 3 };
  const p = projectShock(toy, s, "judge", start);
  const shockedGap = 3500 - 2200;
  const baseGap = 3500 - 4000;

  it("takes one-off costs once, at the start", () => {
    expect(p.points[0].balance).toBeCloseTo(9000 - 1000);
    expect(p.points[1].balance).toBeCloseTo(8000 - shockedGap);
    expect(p.points[2].balance - p.points[1].balance).toBeCloseTo(-shockedGap);
  });

  it("ends the shock after its duration and restores normal income and spending", () => {
    expect(p.points[3].phase).toBe("shock");
    expect(p.points[4].phase).toBe("after");
    expect(p.points[4].balance - p.points[3].balance).toBeCloseTo(-baseGap);
    expect(p.balanceAtShockEnd).toBeCloseTo(8000 - 3 * shockedGap);
    expect(p.afterGap).toBeCloseTo(500);
    expect(p.exhaustedAt).toBeNull();
  });

  it("labels months from the start month", () => {
    expect(p.points[1].label).toBe("Nov 2026");
    expect(p.points[3].label).toBe("Jan 2027");
  });

  it("matches the fixed-rate runway when the shock outlasts the savings", () => {
    for (const m of all.slice(0, 400)) {
      const long: Shock = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 24 };
      const r = scenario(m, long, "judge").runway;
      const pr = projectShock(m, long, "judge", start);
      if (r === null || r === 0 || r > 24) continue;
      expect(pr.exhaustedAt, `#${m.id}`).not.toBeNull();
      expect(pyRound1(pr.exhaustedAt!), `#${m.id}`).toBeCloseTo(r, 1);
      expect(pr.exhaustedDuringShock).toBe(true);
    }
  });

  it("reports running out on day one when the bill is bigger than the buffer", () => {
    const pr = projectShock(toy, { ...NO_SHOCK, oneOffAbs: 12000 }, "judge", start);
    expect(pr.exhaustedAt).toBe(0);
    expect(pr.exhaustedMonth).toEqual(start);
  });

  it("gives the calendar month savings run out in", () => {
    const pr = projectShock(toy, { ...NO_SHOCK, incomePct: 0, durationMonths: 24 }, "judge", start);
    // 9000 / 3500 = 2.57 months → runs out during the 3rd month (Jan 2027)
    expect(pr.exhaustedAt).toBeCloseTo(9000 / 3500);
    expect(pr.exhaustedMonth).toEqual({ y: 2027, m: 1 });
  });
});

describe("field validation", () => {
  it("accepts values in range, with or without units", () => {
    expect(validateField(FIELD.incomePct, "55").value).toBe(55);
    expect(validateField(FIELD.billsPct, "-10%").value).toBe(-10);
    expect(validateField(FIELD.billsPct, "+15").value).toBe(15);
    expect(validateField(FIELD.extraMonthly, "$1,200").value).toBe(1200);
    expect(validateField(FIELD.oneOffMult, "1.5×").value).toBe(1.5);
  });
  it("rejects nonsense with a helpful message", () => {
    expect(validateField(FIELD.incomePct, "120").error).toMatch(/highest is 100%/);
    expect(validateField(FIELD.extraMonthly, "-5").error).toMatch(/negative/);
    expect(validateField(FIELD.durationMonths, "2.5").error).toMatch(/whole months/);
    expect(validateField(FIELD.durationMonths, "0").error).toMatch(/lowest is 1 month/);
    expect(validateField(FIELD.oneOffAbs, "abc").error).toBeTruthy();
    expect(validateField(FIELD.oneOffAbs, "").error).toBeTruthy();
  });
  it("every field explains itself with an example", () => {
    for (const f of FIELDS) expect(f.help).toMatch(/For example/);
  });
  it("clamps stored shocks into range", () => {
    const c = clampShock({ incomePct: 3, billsPct: -5, extraMonthly: -1, oneOffMult: 99, oneOffAbs: 1e9, durationMonths: 2.6, jobLoss: true });
    expect(c).toEqual({ incomePct: 1, billsPct: -1, extraMonthly: 0, oneOffMult: 12, oneOffAbs: 200000, durationMonths: 3, jobLoss: true });
  });
});
