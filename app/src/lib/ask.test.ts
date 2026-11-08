import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMetrics, NO_SHOCK, type MetricsFile } from "./engine";
import { answer, answerTemplate, checkAnswer, eiWeeksFullTime, QUESTIONS, sanitizeMode, sanitizeQuestion, sanitizeShock, toSegments, type QuestionId } from "./ask";

const root = join(__dirname, "..", "..");
const metrics = decodeMetrics(JSON.parse(readFileSync(join(root, "public", "data", "metrics.json"), "utf8")) as MetricsFile);
const get = (id: number) => metrics.get(id)!;
const JOB = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };
const JOB9 = { ...JOB, incomePct: 0.5, durationMonths: 9 };
const FURNACE = { ...NO_SHOCK, oneOffMult: 1 };
const RENT = { ...NO_SHOCK, billsPct: 0.15, durationMonths: 12 };
type Shock = typeof JOB;

const plain = (q: QuestionId, id: number, s: Shock) => {
  const t = answerTemplate(q, get(id), s, "judge");
  return toSegments(t.text, t.slots)
    .map((x) => ("num" in x ? x.num : x.text))
    .join("");
};

describe("ask answers", () => {
  it("52783 money lasts", () =>
    expect(plain("last", 52783, JOB)).toBe("On EI they get $12,267 a month but spend $21,822. That $9,555 gap empties their $20,056 in 2.1 months."));
  it("no-EI layoff and one-off bills use their own wording", () => {
    expect(plain("last", 52783, { ...JOB, incomePct: 0 })).toBe(
      "With no income coming in, they spend $21,822 a month, which empties their $20,056 in 0.9 months.",
    );
    expect(plain("why6", 52783, { ...JOB, incomePct: 0 })).toContain("lasts 6 months with no EI");
    expect(plain("cut", 52783, FURNACE)).toMatch(/^For a one-off bill/);
  });
  it("layoff length uses StatCan and the region's EI weeks", () => {
    expect(plain("layoff", 52783, JOB)).toContain("22.8 weeks, about 5.2 months (Statistics Canada, October 2026)");
    expect(plain("layoff", 52783, JOB)).toContain("2.9% unemployment), EI lasts up to 36 weeks, about 8.3 months");
    expect(plain("layoff", 43402, JOB)).toContain("up to 40 weeks, about 9.2 months");
    expect(answerTemplate("layoff", get(52783), JOB, "judge").sources).toEqual(["statcan", "schedule"]);
  });
  it("why6 names the right fund rule", () => {
    expect(plain("why6", 52783, JOB)).toContain("6 months of the $9,555 monthly gap on EI: $57.3K");
    expect(plain("why6", 43402, JOB)).toContain("3 months of fixed costs ($1,941 a month): $5.8K");
    expect(plain("why6", 52783, JOB9)).toContain("the fund alone falls short");
    expect(plain("why6", 43402, JOB9)).not.toContain("falls short");
  });
  it("cut answer follows the lean-month rule", () => {
    expect(plain("cut", 52783, JOB)).toContain("In their leanest months they spent only $13,833");
    expect(plain("cut", 76493, JOB)).toContain("capped at 50%");
    expect(plain("cut", 43402, JOB)).toMatch(/^They don't need a cut/);
  });
  it("saving answer for 52783 and blocked 76493", () => {
    expect(plain("saving", 52783, JOB)).toContain("Together that's $1,989 a month, reaching $57.3K in 19 months.");
    expect(plain("saving", 76493, JOB)).toBe(
      "They can't save yet: they spend $3,888 a month more than they earn. Pausing the $4,857 loan payment is the first step.",
    );
  });
  it("sanitizeQuestion accepts only the five ids", () => {
    expect(["last", "layoff", "why6", "cut", "saving"].map(sanitizeQuestion)).toEqual(["last", "layoff", "why6", "cut", "saving"]);
    expect([undefined, "", "drop table", 3].map(sanitizeQuestion)).toEqual([null, null, null, null]);
  });
  it("templates never leave a slot unfilled or put a digit in the template text", () => {
    for (const id of [52783, 76493, 97509, 43402])
      for (const s of [JOB, JOB9, FURNACE, RENT])
        for (const { id: q } of QUESTIONS) {
          const t = answerTemplate(q, get(id), s, "judge");
          expect(t.text).not.toMatch(/\d/);
          expect(plain(q, id, s)).not.toMatch(/[{}]|undefined|NaN/);
        }
  });
  it("checker rejects digits, unknown slots and dropped slots", () => {
    const t = answerTemplate("last", get(52783), JOB, "judge");
    expect(checkAnswer({ text: t.text }, t).ok).toBe(true);
    expect(checkAnswer({ text: t.text + " 5" }, t).ok).toBe(false);
    expect(checkAnswer({ text: t.text + " {made_up}" }, t).ok).toBe(false);
    expect(checkAnswer({ text: t.text.replace("{runway}", "soon") }, t).ok).toBe(false);
  });
  it("answer() falls back to the template on error and on a bad reply", async () => {
    const a = await answer("last", get(52783), JOB, "judge", async () => {
      throw new Error("boom");
    });
    expect(a.source).toBe("template");
    const b = await answer("last", get(52783), JOB, "judge", async () => ({ text: "It lasts 2 months." }));
    expect(b.source).toBe("template");
  });
  it("answer() uses a clean Gemini reply and keeps the engine's numbers", async () => {
    const t = answerTemplate("last", get(52783), JOB, "judge");
    const a = await answer("last", get(52783), JOB, "judge", async () => ({ text: `Good news and bad. ${t.text}` }));
    expect(a.source).toBe("gemini");
    expect(a.segments.filter((s) => "num" in s).map((s) => (s as { num: string }).num)).toContain("2.1");
  });
  it("eiWeeksFullTime follows Schedule I", () => expect([2.9, 6, 6.5, 7.07, 9.4, 12].map(eiWeeksFullTime)).toEqual([36, 36, 38, 40, 44, 45]));
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
