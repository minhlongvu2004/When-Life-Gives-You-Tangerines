import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backupPlan, decodeMetrics, NO_SHOCK, type Metrics, type MetricsFile, type Shock } from "./engine";
import {
  buildPrompt,
  checkReply,
  explain,
  fillExplanation,
  fillSlots,
  planFacts,
  sanitizeMode,
  sanitizeShock,
  templateExplanation,
  type Explanation,
} from "./explain";
import { clientIp, rateLimited } from "./rateLimit";

const root = join(__dirname, "..", "..");
const metrics = decodeMetrics(JSON.parse(readFileSync(join(root, "public", "data", "metrics.json"), "utf8")) as MetricsFile);
const all = [...metrics.values()];

const JOB: Shock = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };
const withLoan = all.find((m) => m.P > 0 && m.disc > 0)!;
const noLoan = all.find((m) => m.P === 0 && m.disc > 0)!;

const allText = (e: Explanation) => [e.headline, e.why, ...e.steps.map((s) => s.text)].join("\n");

/** A reply in the right shape for a customer, using only that customer's slots. */
function goodReply(m: Metrics, shock: Shock = JOB): Explanation {
  const facts = planFacts(m, shock, "judge");
  return {
    headline: "Savings last {runway_now} months, and there is a way to stretch it.",
    why: "The steps below add cushion first, then build a fund.",
    steps: facts.stepIds.map((id) => ({
      id,
      text:
        id === "goal"
          ? "Build toward {goal_target}."
          : id === "trim"
            ? "Trim flexible spending for {trim_gain}."
            : id === "loan"
              ? "Ask to defer the loan for {loan_gain}."
              : id === "survival"
                ? "Cut harder for {survival_gain}."
                : "Apply for EI today.",
    })),
  };
}

describe("checkReply", () => {
  const facts = planFacts(withLoan, JOB, "judge");

  it("accepts a well-formed reply that only uses known slots", () => {
    expect(checkReply(goodReply(withLoan), facts).ok).toBe(true);
  });

  it("rejects a digit in the headline", () => {
    const r = goodReply(withLoan);
    r.headline = "Savings last 3 months.";
    expect(checkReply(r, facts)).toEqual({ ok: false, reason: "contains a digit" });
  });

  it("rejects a digit in why and in any step", () => {
    const a = goodReply(withLoan);
    a.why = "About 10 percent more.";
    expect(checkReply(a, facts).ok).toBe(false);
    const b = goodReply(withLoan);
    b.steps[1].text = "Cut spending by 25%.";
    expect(checkReply(b, facts).ok).toBe(false);
  });

  it("rejects an unknown slot", () => {
    const r = goodReply(withLoan);
    r.why = "You will save {secret_amount} a month.";
    const res = checkReply(r, facts);
    expect(res).toEqual({ ok: false, reason: "unknown slot {secret_amount}" });
  });

  it("rejects a slot that exists in general but not for this customer", () => {
    const f = planFacts(noLoan, JOB, "judge"); // no loan, so no {loan_gain}
    expect("loan_gain" in f.slots).toBe(false);
    const r = goodReply(noLoan);
    r.why = "Deferring the loan gives {loan_gain}.";
    expect(checkReply(r, f).ok).toBe(false);
  });

  it("rejects stray braces and malformed slots", () => {
    const r = goodReply(withLoan);
    r.why = "Broken {runway_now";
    expect(checkReply(r, facts).ok).toBe(false);
  });

  it("rejects the wrong step list or order", () => {
    const r = goodReply(withLoan);
    r.steps.reverse();
    expect(checkReply(r, facts).ok).toBe(false);
    const short = goodReply(withLoan);
    short.steps.pop();
    expect(checkReply(short, facts).ok).toBe(false);
  });

  it.each([null, "text", 5, [], { headline: 1 }, { headline: "a", why: "b" }])("rejects junk %#", (junk) => {
    expect(checkReply(junk, facts).ok).toBe(false);
  });
});

describe("filling slots", () => {
  it("puts the engine's numbers into the text", () => {
    const facts = planFacts(withLoan, JOB, "judge");
    const first = backupPlan(withLoan, JOB, "judge")[0].runway;
    const filled = fillExplanation(goodReply(withLoan), facts.slots);
    expect(filled.headline).toContain(first === null ? "120+" : first.toFixed(1));
    expect(allText(filled)).not.toMatch(/[{}]/);
  });

  it("leaves an unknown slot untouched instead of inventing a value", () => {
    expect(fillSlots("a {nope} b", {})).toBe("a {nope} b");
  });

  it("slot values come from the engine and nowhere else", () => {
    const steps = backupPlan(withLoan, JOB, "judge");
    const facts = planFacts(withLoan, JOB, "judge");
    const trim = steps.find((s) => s.label.startsWith("Trim"))!;
    expect(facts.slots.trim_gain).toBe(trim.gained === null ? "the rest of the shortfall" : `${trim.gained.toFixed(1)} months`);
  });
});

describe("explain(): Gemini first, template as the safety net", () => {
  const facts = planFacts(withLoan, JOB, "judge");

  it("uses Gemini's words when they pass the check", async () => {
    const res = await explain(facts, async () => goodReply(withLoan));
    expect(res.source).toBe("gemini");
    expect(res.headline).not.toMatch(/[{}]/);
  });

  it("falls back to the template when Gemini throws", async () => {
    const res = await explain(facts, async () => {
      throw new Error("boom");
    });
    expect(res.source).toBe("template");
    expect(res.rejected).toBe("boom");
    expect(res.steps.map((s) => s.id)).toEqual(facts.stepIds);
  });

  it("falls back when Gemini times out", async () => {
    const res = await explain(facts, () => Promise.reject(new DOMException("timed out", "TimeoutError")));
    expect(res.source).toBe("template");
  });

  it("falls back when Gemini writes a digit", async () => {
    const bad = goodReply(withLoan);
    bad.why = "You will be fine in 3 months.";
    const res = await explain(facts, async () => bad);
    expect(res.source).toBe("template");
    expect(res.rejected).toBe("contains a digit");
  });

  it("falls back when no model is configured", async () => {
    const res = await explain(facts, null);
    expect(res.source).toBe("template");
  });

  it("the template always works: no leftover braces, no unknown slots, for many customers and shocks", () => {
    const shocks: Shock[] = [
      JOB,
      { ...NO_SHOCK, incomePct: 0.8, durationMonths: 6 },
      { ...NO_SHOCK, billsPct: 0.15, extraMonthly: 300 },
      { ...NO_SHOCK, oneOffMult: 1, oneOffAbs: 1200 },
    ];
    for (const m of all.filter((_, i) => i % 15 === 0)) {
      for (const s of shocks) {
        for (const mode of ["judge", "realistic"] as const) {
          const f = planFacts(m, s, mode);
          const t = templateExplanation(f);
          // the template must itself pass the same check Gemini's words must pass
          expect(checkReply(t, f).ok, `account ${m.id}`).toBe(true);
          expect(allText(fillExplanation(t, f.slots))).not.toMatch(/[{}]/);
        }
      }
    }
  });
});

describe("prompt", () => {
  it("lists only this customer's slots and forbids digits", () => {
    const p = buildPrompt(planFacts(noLoan, JOB, "judge"));
    expect(p).toContain("{runway_now}");
    expect(p).not.toContain("{loan_gain}:");
    expect(p).toContain("{trim_gain}:");
    expect(p).toMatch(/NOT the total runway/);
    expect(p).toMatch(/never write any digit/i);
  });
});

describe("request validation", () => {
  it("accepts a normal shock and rejects bad ones", () => {
    expect(sanitizeShock(JOB)).toEqual(JOB);
    expect(sanitizeShock({ ...JOB, incomePct: -1 })).toBeNull();
    expect(sanitizeShock({ ...JOB, extraMonthly: 1e9 })).toBeNull();
    expect(sanitizeShock({ ...JOB, jobLoss: "yes" })).toBeNull();
    expect(sanitizeShock({ ...JOB, durationMonths: NaN })).toBeNull();
    expect(sanitizeShock(null)).toBeNull();
    expect(sanitizeShock("x")).toBeNull();
  });
  it("only two modes", () => {
    expect(sanitizeMode("judge")).toBe("judge");
    expect(sanitizeMode("realistic")).toBe("realistic");
    expect(sanitizeMode("admin")).toBeNull();
  });
});

describe("rate limit", () => {
  it("blocks the 21st request in a minute, then recovers", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(rateLimited("ip-a", 20, 60_000, t0 + i)).toBe(false);
    expect(rateLimited("ip-a", 20, 60_000, t0 + 21)).toBe(true);
    expect(rateLimited("ip-b", 20, 60_000, t0 + 21)).toBe(false); // other IPs unaffected
    expect(rateLimited("ip-a", 20, 60_000, t0 + 61_000)).toBe(false); // window passed
  });
  it("reads the first forwarded IP", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
});
