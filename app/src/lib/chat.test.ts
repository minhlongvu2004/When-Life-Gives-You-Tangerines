import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChatPrompt, chat, checkChat, pageFacts } from "./chat";
import { decodeMetrics, NO_SHOCK, type MetricsFile } from "./engine";

const root = join(__dirname, "..", "..");
const metrics = decodeMetrics(JSON.parse(readFileSync(join(root, "public", "data", "metrics.json"), "utf8")) as MetricsFile);
const get = (id: number) => metrics.get(id)!;
const JOB = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };

describe("free-text chat", () => {
  const facts = pageFacts(get(52783), JOB, "judge");
  it("the page facts carry every card number behind a slot", () => {
    expect(facts.slots).toMatchObject({ runway_nothing: "2.1", runway_short: "3.4", runway_long: "6.0", cut_target: "$13,833", save_monthly: "$1,989" });
    expect(facts.table).toContain("{runway_short} = 3.4");
  });
  it("the prompt shows the page, the question and the history, and forbids digits in the reply", () => {
    const p = buildChatPrompt(facts, "why is the long term one better?", [{ role: "me", text: "hi" }]);
    expect(p).toContain("why is the long term one better?");
    expect(p).toContain("{cut_target}");
    expect(p).toMatch(/never write any digit/i);
    expect(p).toContain("hi");
  });
  it("checkChat accepts known slots only, no digits, no stray braces", () => {
    expect(checkChat({ text: "It lasts {runway_nothing} months.", sources: ["ei"] }, facts.slots)).toMatchObject({ ok: true, sources: ["ei"] });
    expect(checkChat({ text: "It lasts 2 months." }, facts.slots).ok).toBe(false);
    expect(checkChat({ text: "It lasts {nope} months." }, facts.slots).ok).toBe(false);
    expect(checkChat({ text: "Oops { broken" }, facts.slots).ok).toBe(false);
    expect(checkChat({ text: "ok", sources: ["evil"] }, facts.slots)).toMatchObject({ ok: true, sources: [] });
  });
  it("chat() fills the engine's numbers into Gemini's wording", async () => {
    const r = await chat("how long?", [], get(52783), JOB, "judge", async () => ({ text: "Only {runway_nothing} months if they do nothing.", sources: [] }));
    expect(r && r.segments).toEqual([{ text: "Only " }, { num: "2.1" }, { text: " months if they do nothing." }]);
  });
  it("chat() returns null on a bad reply, an error, or no model", async () => {
    expect(await chat("x", [], get(52783), JOB, "judge", async () => ({ text: "about 2 months" }))).toBeNull();
    expect(await chat("x", [], get(52783), JOB, "judge", async () => { throw new Error("boom"); })).toBeNull();
    expect(await chat("x", [], get(52783), JOB, "judge", null)).toBeNull();
  });
});
