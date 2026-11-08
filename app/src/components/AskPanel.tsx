"use client";

import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QUESTIONS, type QuestionId, type Segment } from "@/lib/ask";
import type { Metrics, Mode, Shock } from "@/lib/engine";

type Source = { label: string; url: string };
type Msg =
  | { role: "me"; text: string }
  | { role: "bot"; text: string }
  | { role: "bot"; pending: true }
  | { role: "bot"; segments: Segment[]; sources: Source[] };

const Spark = () => (
  <span className="grid size-7 flex-none place-items-center rounded-[9px] bg-gradient-to-br from-accent to-[#ffb36b] text-white">
    <Sparkles className="size-3.5" aria-hidden />
  </span>
);

/** Floating "Ask about this plan" button and its chat panel. Five preset questions, no free text.
 *  Every number in an answer comes from the server's rules engine (POST /api/ask). */
export function AskPanel({ m, shock, mode }: { m: Metrics; shock: Shock; mode: Mode }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mounted, setMounted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const run = useRef(0); // ignores answers that arrive after the plan changed

  const greeting = useCallback((): Msg[] => [{ role: "bot", text: `Hi! Ask me anything about #${m.id}'s plan, like why a step is there or where a number comes from.` }], [m.id]);

  useEffect(() => setMounted(true), []);

  // re-greet when the customer, the shock or the mode changes
  const planKey = JSON.stringify([m.id, shock, mode]);
  useEffect(() => {
    run.current++;
    setMsgs(greeting());
  }, [planKey, greeting]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const [draft, setDraft] = useState("");
  const asText = (x: Msg) => ("segments" in x ? x.segments.map((p) => ("num" in p ? p.num : p.text)).join("") : "text" in x ? x.text : "");

  /** A preset chip sends its id; typed text sends the words plus the last few turns, so follow-ups make sense. */
  const ask = async (label: string, body: { q: QuestionId } | { text: string }) => {
    const history = msgs.filter((x) => !("pending" in x)).slice(-6).map((x) => ({ role: x.role, text: asText(x) }));
    const mine = ++run.current;
    setMsgs((x) => [...x.filter((y) => !("pending" in y)), { role: "me", text: label }, { role: "bot", pending: true }]);
    let reply: Msg = { role: "bot", text: "Sorry, I couldn't answer that just now. Please try again." };
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, shock, mode, ...body, ...("text" in body ? { history } : {}) }),
      });
      if (res.ok) {
        const data = (await res.json()) as { segments: Segment[]; sources: Source[] };
        reply = { role: "bot", segments: data.segments, sources: data.sources };
      }
    } catch {
      /* keep the apology */
    }
    if (mine !== run.current) return;
    setMsgs((x) => [...x.filter((y) => !("pending" in y)), reply]);
  };

  if (!mounted) return null;
  // Portal to <body>: the page content is scaled (zoom) and animated (transform), which would move a fixed element.
  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-6 bottom-6 z-20 flex items-center gap-2.5 rounded-full bg-ink py-[13px] pr-5 pl-3.5 text-[15px] font-bold text-page shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition-transform hover:-translate-y-0.5"
        >
          <Spark />
          Ask about this plan
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Ask about this plan"
          className="fixed right-6 bottom-6 z-30 flex h-[min(520px,calc(100vh-48px))] w-[min(380px,calc(100vw-32px))] origin-bottom-right animate-[askpop_0.22s_ease] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.22)]"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
            <Spark />
            <div>
              <b className="block text-[15px]">Ask about this plan</b>
              <small className="text-xs text-muted">Numbers from the engine · words by Gemini</small>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-auto grid size-[30px] place-items-center rounded-full bg-surface-2 text-ink-2 hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div ref={scroller} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
            {msgs.map((x, i) =>
              x.role === "me" ? (
                <div key={i} className="max-w-[88%] self-end rounded-2xl rounded-br-[5px] bg-ink px-3 py-2.5 text-sm leading-[1.5] text-page">
                  {x.text}
                </div>
              ) : (
                <div key={i} className="max-w-[88%] rounded-2xl rounded-bl-[5px] bg-surface-2 px-3 py-2.5 text-sm leading-[1.5]">
                  {"pending" in x ? (
                    <span className="inline-flex gap-1 px-0.5 py-1" aria-label="Typing">
                      {[0, 1, 2].map((d) => (
                        <i key={d} className="size-1.5 animate-[askblink_1s_infinite] rounded-full bg-muted" style={{ animationDelay: `${d * 0.15}s` }} />
                      ))}
                    </span>
                  ) : "segments" in x ? (
                    <>
                      {x.segments.map((s, j) =>
                        "num" in s ? (
                          <span key={j} className="rounded-[5px] bg-accent-soft px-1 font-bold text-accent-ink">
                            {s.num}
                          </span>
                        ) : (
                          <span key={j}>{s.text}</span>
                        ),
                      )}
                      {x.sources.length > 0 && (
                        <div className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-muted">
                          Sources:{" "}
                          {x.sources.map((s, j) => (
                            <span key={s.url}>
                              {j > 0 && " · "}
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-s1 underline underline-offset-2">
                                {s.label}
                              </a>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    x.text
                  )}
                </div>
              ),
            )}
          </div>

          {!msgs.some((x) => x.role === "me") && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {QUESTIONS.map((q) => {
              const label = q.chip(shock.durationMonths);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => ask(label, { q: q.id })}
                  className="rounded-full border-[1.5px] border-line bg-surface px-[11px] py-1.5 text-[12.5px] font-semibold text-ink-2 hover:border-accent"
                >
                  {label}
                </button>
              );
            })}
          </div>
          )}
          <form
            className="flex gap-2 border-t border-line px-3 pt-2.5 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              const t = draft.trim();
              if (!t) return;
              setDraft("");
              ask(t, { text: t });
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder="Ask why…"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border-[1.5px] border-line bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            />
            <button type="submit" className="rounded-full bg-accent px-4 font-bold text-white">
              Send
            </button>
          </form>
        </div>
      )}
    </>,
    document.body,
  );
}
