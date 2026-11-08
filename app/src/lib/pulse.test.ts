import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { heightToVolume, milestoneCrossed, NO_PULSE_CHANGES, projectPulse, surplusOf, volumeToHeight } from "./pulse";
import { decodeRank } from "./rank";

const data = decodeRank(JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "rank.json"), "utf8")));
const pulse = JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "pulse.json"), "utf8")) as { cols: string[]; rows: unknown[][] };
const now = { y: 2026, m: 11 };

describe("juice geometry", () => {
  it("fills by volume, not height", () => {
    for (const v of [0, 0.1, 0.25, 0.5, 0.72, 0.9, 1]) expect(heightToVolume(volumeToHeight(v))).toBeCloseTo(v, 9);
    expect(volumeToHeight(0.5)).toBeCloseTo(0.5, 9);
    expect(volumeToHeight(0.72)).toBeLessThan(0.72); // the wide middle holds more, so 72% volume sits lower
    expect(volumeToHeight(0.72)).toBeCloseTo(0.6513, 3); // ½ − sin(asin(−0.44) / 3)
  });
  it("milestones fire only when crossed upward", () => {
    expect(milestoneCrossed(48, 52)).toBe(50);
    expect(milestoneCrossed(70, 91)).toBe(90);
    expect(milestoneCrossed(52, 48)).toBeNull();
    expect(milestoneCrossed(50, 60)).toBeNull();
  });
});

describe("pulse uses the same score as the Rank page", () => {
  const sample = data.rows.filter((_, i) => i % 53 === 0);
  it("no changes gives the published score", () => {
    for (const r of sample) expect(projectPulse(data, r, NO_PULSE_CHANGES, now).score).toBe(r.score);
  });
  it("savings can't exceed the surplus (no double counting)", () => {
    for (const r of sample) {
      const huge = projectPulse(data, r, { ...NO_PULSE_CHANGES, save: 1e7 }, now);
      const capped = projectPulse(data, r, { ...NO_PULSE_CHANGES, save: surplusOf(r) }, now);
      expect(huge.score).toBe(capped.score);
      expect(huge.effectiveSave).toBeCloseTo(surplusOf(r), 6);
    }
  });
  it("spending more lowers the score; spending less raises it", () => {
    for (const r of sample) {
      const more = projectPulse(data, r, { ...NO_PULSE_CHANGES, spend: 0.2 * r.S }, now).score;
      const less = projectPulse(data, r, { ...NO_PULSE_CHANGES, spend: -0.2 * r.S }, now).score;
      expect(more).toBeLessThanOrEqual(r.score);
      expect(less).toBeGreaterThanOrEqual(r.score);
    }
  });
  it("category deltas add up to the score change", () => {
    for (const r of sample) {
      const p = projectPulse(data, r, { ...NO_PULSE_CHANGES, spend: -300, income: 200, months: 12 }, now);
      const sum = p.deltas.reduce((x, d) => x + d.points, 0);
      expect(Math.abs(r.score + sum - p.score)).toBeLessThanOrEqual(0.051 + Math.max(0, r.score + sum - 100));
    }
  });
  it("history exists for every account in accounts.csv", () => {
    expect(pulse.rows.length).toBe(data.meta.total);
  });
});
