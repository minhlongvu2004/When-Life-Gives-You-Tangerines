// One Gemini REST call, shared by every feature that asks the model for words.

export const GEMINI_TIMEOUT_MS = 5000;

export type ModelCall = (prompt: string) => Promise<unknown>;

/** Real Gemini call (REST). Throws on any HTTP error, timeout or unparseable reply. */
export function geminiJson(opts: { apiKey: string; model: string; schema: object; fetchImpl?: typeof fetch }): ModelCall {
  const f = opts.fetchImpl ?? fetch;
  return async (prompt) => {
    const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json", responseSchema: opts.schema },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return JSON.parse(text);
  };
}
