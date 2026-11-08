import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMetrics, NO_SHOCK, type MetricsFile } from "./engine";
import { leanCut, planCards } from "./planCards";

const root = join(__dirname, "..", "..");
const metrics = decodeMetrics(JSON.parse(readFileSync(join(root, "public", "data", "metrics.json"), "utf8")) as MetricsFile);
const all = [...metrics.values()];
const get = (id: number) => metrics.get(id)!;
const JOB = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };
const JOB9 = { ...JOB, incomePct: 0.5, durationMonths: 9 };
const FURNACE = { ...NO_SHOCK, oneOffMult: 1 };
const RENT = { ...NO_SHOCK, billsPct: 0.15, durationMonths: 12 };

describe("planCards", () => {
  it("52783 laid off: 2.1 / 3.4 / 6.0", () => {
    const c = planCards(get(52783), JOB, "judge");
    expect([c.nothing.runway, c.short.runway, c.long.runway]).toEqual([2.1, 3.4, 6.0]);
    expect(c.nothing.pill).toBe("3.9 months short");
    expect(c.short.actions).toEqual([{ icon: "cut", text: "Cut card & cash spending to {amount}/mo", amount: "$13,833" }]);
    expect(c.long.timing).toBe("Hits in 19 months");
    expect(c.long.actions.map((a) => a.amount)).toEqual(["$1,989", "10%"]);
    expect(c.long.pill).toBeUndefined(); // never a green pill
  });
  it("52783 EI 50% for 9 months: long card is short", () => {
    const c = planCards(get(52783), JOB9, "judge");
    expect([c.nothing.runway, c.short.runway, c.long.runway]).toEqual([1.9, 2.9, 5.4]);
    expect(c.long.pill).toBe("3.6 months short");
  });
  it("52783 furnace: bill too big, spread it", () => {
    const c = planCards(get(52783), FURNACE, "judge");
    expect(c.nothing).toMatchObject({ runway: 0, state: "bad", pill: "Can't cover the bill" });
    expect(c.short.runway).toBe(15.0);
    expect(c.short.actions.map((a) => a.amount)).toEqual(["12-month plan", "$1,819"]);
  });
  it("76493: loan paused, cut capped at 50%, fund blocked", () => {
    const c = planCards(get(76493), JOB, "judge");
    expect(c.short.runway).toBe(4.7);
    expect(c.short.actions.map((a) => a.amount)).toEqual(["$4,857", "$315"]);
    expect(c.facts.capped).toBe(true);
    expect(c.long).toMatchObject({ runway: undefined, state: "blocked", timing: "Hits later" });
    expect(c.long.empty).toBe("They spend $3,888 a month more than they earn. Fix that first.");
  });
  it("97509 and 43402: safe and funded still show months", () => {
    for (const id of [97509, 43402]) {
      const c = planCards(get(id), JOB, "judge");
      expect(c.short.runway).toBe(c.nothing.runway);
      expect(c.long.runway).toBe(c.nothing.runway);
      expect(c.short.actions).toEqual([]);
      expect(c.short.empty).toBe("Nothing to do. Their savings already outlast the 6 months.");
      expect(c.long.timing).toBe("Already ready");
    }
  });
  it("realistic mode uses the EI cap", () => expect(planCards(get(52783), JOB, "realistic").nothing.runway).toBe(1.1));
  it("rent shock: no EI, already safe", () => {
    const c = planCards(get(52783), RENT, "judge");
    expect(c.nothing.runway).toBe(115.7);
    expect(c.facts.safe).toBe(true);
  });
  it("nothing to cut", () => {
    const m = { ...get(52783), I: 1000, S: 2000, B: 1000, disc: 0, lean: 0, P: 0 };
    const c = planCards(m, JOB, "judge");
    expect(c.short.actions).toEqual([]);
    expect(c.short.empty).toBe("No flexible spending or loan payment to cut.");
    expect(c.short.runway).toBe(c.nothing.runway);
  });
  it("job loss without EI (main's preset): income 0, strip flags no EI", () => {
    const c = planCards(get(52783), { ...JOB, incomePct: 0 }, "judge");
    expect(c.income).toBe(0);
    expect(c.nothing.runway).toBe(0.9);
  });
  it("bill too big plus an income cut: spread AND cut; pure one-off: spread only", () => {
    const combo = { ...NO_SHOCK, incomePct: 0.75, oneOffMult: 1, durationMonths: 6 }; // main's "Income cut + emergency repair"
    expect(planCards(get(52783), combo, "judge").short.actions.map((a) => a.icon)).toEqual(["receipt", "card", "cut"]);
    expect(planCards(get(52783), FURNACE, "judge").short.actions.map((a) => a.icon)).toEqual(["receipt", "card"]);
  });
  it("furnace spread wording is generic", () =>
    expect(planCards(get(52783), FURNACE, "judge").short.actions[0].text).toBe("Spread the bill over a {amount}"));
  it("leanCut clamps to 10%..50%", () => {
    const base = get(52783);
    expect(leanCut({ ...base, disc: 100, lean: 120 })).toBe(0.1);
    expect(leanCut({ ...base, disc: 100, lean: 0 })).toBe(0.5);
    expect(leanCut({ ...base, disc: 0, lean: 0 })).toBe(0);
  });
  it("results never decrease from Do nothing to Short term for any account", () => {
    for (const m of all)
      for (const s of [JOB, JOB9, FURNACE]) {
        const c = planCards(m, s, "judge"),
          v = (r: number | null | undefined) => (r === null ? 1e9 : (r ?? -1));
        expect(v(c.short.runway)).toBeGreaterThanOrEqual(v(c.nothing.runway));
      }
  });
});
