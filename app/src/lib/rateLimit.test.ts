import { describe, expect, it } from "vitest";
import { clientIp, rateLimited } from "./rateLimit";

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
