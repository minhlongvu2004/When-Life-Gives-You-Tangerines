import { describe, expect, it, vi } from "vitest";
import { geminiJson } from "./gemini";

const schema = { type: "OBJECT", properties: { text: { type: "STRING" } } };

describe("geminiJson", () => {
  const ok = (text: string) =>
    ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }) as Response;

  it("sends the key in a header, not the URL, and parses JSON", async () => {
    const f = vi.fn(async () => ok('{"text":"x"}'));
    const out = await geminiJson({ apiKey: "KEY", model: "m", schema, fetchImpl: f as unknown as typeof fetch })("hi");
    expect(out).toEqual({ text: "x" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("KEY");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
    expect(JSON.parse(init.body as string).generationConfig.responseSchema).toEqual(schema);
  });

  it("throws on an HTTP error so the caller can fall back", async () => {
    const f = vi.fn(async () => ({ ok: false, status: 429 }) as Response);
    await expect(geminiJson({ apiKey: "k", model: "m", schema, fetchImpl: f as unknown as typeof fetch })("hi")).rejects.toThrow("429");
  });
});
