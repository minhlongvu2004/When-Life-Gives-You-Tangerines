import { describe, expect, it } from "vitest";
import { parseId, resolveId, type ClientMap } from "./ids";

// Mirrors the dataset: account IDs are 5 digits, client IDs are 7 digits, and the two never overlap.
const accounts = new Set([52783, 62236]);
const clients: ClientMap = new Map([
  [6856613, { account: 62236, role: "owner" }],
  [7391533, { account: 52783, role: "owner" }],
  [8100909, { account: 52783, role: "authorized user" }],
]);
const find = (raw: string) => resolveId(parseId(raw), (n) => accounts.has(n), clients);

describe("parseId", () => {
  it("reads plain numbers", () => expect(parseId("52783")).toBe(52783));
  it("ignores spaces, commas, a # and quotes copied from a spreadsheet", () => {
    expect(parseId("  #52783 ")).toBe(52783);
    expect(parseId("6,856,613")).toBe(6856613);
    expect(parseId('"7391533"')).toBe(7391533);
  });
  it("rejects empty or non-numeric input", () => {
    expect(parseId("")).toBeNull();
    expect(parseId("abc")).toBeNull();
  });
});

describe("resolveId", () => {
  it("opens an account ID directly", () => {
    expect(find("52783")).toEqual({ account: 52783 });
  });
  it("opens the account that an owner's client ID belongs to", () => {
    expect(find("6856613")).toEqual({ account: 62236, client: 6856613, role: "owner" });
  });
  it("opens the account for an authorized user and says so", () => {
    expect(find("8100909")).toEqual({ account: 52783, client: 8100909, role: "authorized user" });
  });
  it("returns null for an ID that is neither", () => {
    expect(find("123")).toBeNull();
    expect(find("")).toBeNull();
  });
  it("prefers the account when an ID is somehow both", () => {
    const both: ClientMap = new Map([[52783, { account: 62236, role: "owner" }]]);
    expect(resolveId(52783, (n) => accounts.has(n), both)).toEqual({ account: 52783 });
  });
});
