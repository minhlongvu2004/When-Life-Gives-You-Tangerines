import { describe, expect, it } from "vitest";
import { parseTwist } from "./twist";

describe("parseTwist", () => {
  it("brief example 1: laid off, EI 55% for 6 months", () => {
    const { shock } = parseTwist('This customer was laid off. EI pays 55% of their usual income for 6 months. Do they make it?');
    expect(shock).toMatchObject({ jobLoss: true, incomePct: 0.55, durationMonths: 6, billsPct: 0, oneOffMult: 0 });
  });
  it("brief example 2: furnace = a full month of typical spending", () => {
    const { shock } = parseTwist("The furnace dies, and the repair costs a full month of their typical spending.");
    expect(shock).toMatchObject({ jobLoss: false, incomePct: 1, oneOffMult: 1, oneOffAbs: 0 });
  });
  it("brief example 3: job loss + bills up 15%", () => {
    const { shock } = parseTwist("They lose their job (EI at 55%) and their household bills go up 15% in the same month.");
    expect(shock).toMatchObject({ jobLoss: true, incomePct: 0.55, billsPct: 0.15 });
  });
  it("dollar one-off", () => {
    expect(parseTwist("Their car needs a $4,500 repair.").shock.oneOffAbs).toBe(4500);
  });
  it("two months of spending", () => {
    expect(parseTwist("A medical emergency costs two months of their spending.").shock.oneOffMult).toBe(2);
  });
  it("rent up by dollars per month", () => {
    expect(parseTwist("Rent goes up by $400 a month.").shock.extraMonthly).toBe(400);
  });
  it("EI at 50% for 9 months", () => {
    const { shock } = parseTwist("Job loss with EI at 50% for nine months.");
    expect(shock).toMatchObject({ incomePct: 0.5, durationMonths: 9 });
  });
  it("pay cut", () => {
    expect(parseTwist("Their hours are cut and income drops 30%.").shock.incomePct).toBeCloseTo(0.7);
  });
  it("percent spelled out", () => {
    expect(parseTwist("Household bills go up 15 percent.").shock.billsPct).toBeCloseTo(0.15);
    expect(parseTwist("Rent rises 10 per cent.").shock.billsPct).toBeCloseTo(0.1);
  });
  it("months' worth of spending", () => {
    expect(parseTwist("A surprise repair costs two months' worth of spending.").shock.oneOffMult).toBe(2);
  });
  it("EI at 55 percent", () => {
    expect(parseTwist("Laid off; EI pays 55 percent of usual income for 6 months.").shock).toMatchObject({ incomePct: 0.55, durationMonths: 6 });
  });
});
