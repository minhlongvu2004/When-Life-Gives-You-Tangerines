"use client";

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { ArrowRight, Loader2, RotateCcw, Search, Shuffle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORY_META, leagueOfRank, nextLeague, topPct, type CategoryKey, type RankData, type RankRow } from "@/lib/rank";
import { LEAGUE_STYLE, ResilienceBadge } from "./ResilienceBadge";

/* ------------------------------------------------------------------ search */

export function AccountRankSearch({
  ready,
  onSubmit,
  examples,
  busy,
  error,
  compact,
}: {
  ready: boolean;
  onSubmit: (raw: string) => void;
  examples: { id: number; label: string }[];
  busy?: boolean;
  error?: string;
  compact?: boolean;
}) {
  const [v, setV] = useState("");
  return (
    <div className={`wf-card mx-auto max-w-2xl text-center ${compact ? "p-4" : "p-6 sm:p-8"}`}>
      {!compact && (
        <>
          <h2 className="text-2xl font-semibold tracking-tight">Find Your Financial Rank</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-2">Enter your account ID to discover how your financial resilience compares with other accounts.</p>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(v);
        }}
        className={`mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface-2 p-2 pl-4 focus-within:border-accent ${compact ? "" : "mt-6"}`}
      >
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <input
          inputMode="numeric"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
          placeholder={ready ? "Account ID, e.g. 20134" : "Loading rankings…"}
          className="tnum min-w-0 flex-1 bg-transparent py-2 text-lg outline-none placeholder:text-muted"
          aria-label="Account ID"
          aria-invalid={!!error}
          aria-describedby={error ? "rank-err" : undefined}
        />
        <button disabled={!ready || busy} className="wf-cta flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 font-semibold whitespace-nowrap text-white disabled:opacity-50 sm:px-5">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          Reveal My Rank
        </button>
      </form>
      <AnimatePresence>
        {error && (
          <motion.p id="rank-err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-sm text-critical-text" role="alert">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {!compact && ready && examples.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          {examples.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setV(String(x.id));
                onSubmit(String(x.id));
              }}
              className="btn btn-secondary rounded-full px-3 py-1.5"
            >
              {x.label === "Surprise me" ? <Shuffle className="size-3.5" aria-hidden /> : <ArrowRight className="size-3.5" aria-hidden />}
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ confetti (decorative only) */

const CONFETTI_COLORS = ["#f2691d", "#8b5cf6", "#22d3ee", "#fcd34d", "#f472b6", "#ffffff"];
function Confetti({ colors }: { colors: string[] }) {
  // fixed pseudo-random layout from the index, so it renders the same every time
  const pieces = Array.from({ length: 70 }, (_, i) => {
    const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    return { left: r(1) * 100, dx: (r(2) - 0.5) * 220, rot: 360 + r(3) * 720, dur: 2.2 + r(4) * 1.6, delay: r(5) * 0.5, color: [...colors, ...CONFETTI_COLORS][i % (colors.length + 6)] };
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="rk-confetti"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              "--dx": `${p.dx}px`,
              "--rot": `${p.rot}deg`,
              "--dur": `${p.dur}s`,
              "--delay": `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the reveal */

function useCountTo(target: number, from: number, start: boolean, duration: number, onDone?: () => void) {
  const mv = useMotionValue(from);
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!start) {
      mv.set(from);
      setV(from);
      return;
    }
    const c = animate(mv, target, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setV, onComplete: onDone });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, from, start, duration]);
  return v;
}

export function strongestCategory(data: RankData, row: RankRow): CategoryKey {
  // strongest relative to other accounts; ties go to the bigger contributor
  const cats: CategoryKey[] = ["buffer", "cashflow", "stability", "debt"];
  const pctOf = (c: CategoryKey) => data.catSorted[c].filter((x) => x < row[c] - 1e-9).length / data.catSorted[c].length;
  return cats.sort((a, b) => pctOf(b) - pctOf(a) || data.meta.weights[b] * row[b] - data.meta.weights[a] * row[a])[0];
}

export function RankReveal({ data, row, replayKey, onReplay }: { data: RankData; row: RankRow; replayKey: number; onReplay: () => void }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(reduce ? 4 : 0);
  const n = data.meta.n;
  const league = leagueOfRank(data.meta, row.rank);
  const L = LEAGUE_STYLE[league];
  const top = topPct(row.rank, n);
  const strong = strongestCategory(data, row);
  const nl = nextLeague(data, row);
  const celebrate = league === "diamond" || league === "platinum";

  useEffect(() => {
    if (reduce) return setPhase(4);
    setPhase(0);
    const ts = [setTimeout(() => setPhase(1), 1700), setTimeout(() => setPhase(2), 2300), setTimeout(() => setPhase(3), 3300), setTimeout(() => setPhase(4), 3900)];
    return () => ts.forEach(clearTimeout);
  }, [replayKey, row.id, reduce]);

  const rankShown = useCountTo(row.rank, n, true, reduce ? 0 : 1.6);
  const scoreShown = useCountTo(row.score, 0, phase >= 2, reduce ? 0 : 1.1);

  return (
    <div
      className="wf-card rk-shine relative overflow-hidden px-5 py-8 sm:px-10 sm:py-10"
      style={{ borderColor: `${L.mid}66`, boxShadow: `0 0 0 1px ${L.mid}22 inset, 0 30px 90px -40px ${L.mid}` }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(600px 300px at 50% 0%, ${L.mid}22, transparent 70%)` }} />
      {celebrate && phase >= 1 && <Confetti key={replayKey} colors={[L.light, L.mid]} />}

      <div className="relative flex items-center justify-between gap-3">
        <div className="text-xs font-bold tracking-[0.25em] text-ink-2 uppercase">Your Financial Resilience Rank</div>
        <button onClick={onReplay} className="btn btn-outline gap-1 rounded-full px-2.5 py-1 text-xs" aria-label="Replay the rank reveal">
          <RotateCcw className="size-3.5" aria-hidden /> Replay
        </button>
      </div>

      <div className="relative mt-6 grid items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
        {/* rank */}
        <div className="text-center md:text-left">
          <div className="text-sm text-ink-2">Rank</div>
          <div className="tnum rk-glow-text font-semibold tracking-tighter" style={{ ["--rk-glow" as string]: `${L.mid}aa`, fontSize: "clamp(3.5rem, 9vw, 5.5rem)", lineHeight: 1 }}>
            #{Math.round(rankShown).toLocaleString("en-CA")}
          </div>
          <div className="tnum mt-1 text-lg text-ink-2">/ {n.toLocaleString("en-CA")} ranked accounts</div>
          <AnimatePresence>
            {phase >= 3 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: `${L.mid}26`, color: L.ink }}>
                Top {top < 1 ? Math.max(0.1, Math.ceil(top * 10) / 10).toFixed(1) : Math.round(top)}%
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* badge */}
        <div className="flex justify-center">
          <AnimatePresence mode="wait">
            {phase >= 1 ? (
              <motion.div
                key={`badge-${replayKey}`}
                initial={{ scale: 0.2, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 13 }}
              >
                <ResilienceBadge league={league} size={168} />
              </motion.div>
            ) : (
              <motion.div key="wait" exit={{ opacity: 0, scale: 0.8 }} className="grid h-[200px] w-[168px] place-items-center">
                <div className="size-28 animate-pulse rounded-full bg-gradient-to-br from-accent/30 to-[var(--wf-violet)]/30 blur-md" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* score */}
        <div className="text-center md:text-right">
          <div className="text-sm text-ink-2">Resilience Score</div>
          <div className="tnum font-semibold tracking-tighter" style={{ fontSize: "clamp(3rem, 7vw, 4.5rem)", lineHeight: 1 }}>
            {scoreShown.toFixed(1)}
            <span className="text-2xl text-muted">/100</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, var(--accent), ${L.mid})`, boxShadow: `0 0 16px ${L.mid}` }}
              initial={{ width: 0 }}
              animate={{ width: phase >= 2 ? `${row.score}%` : 0 }}
              transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <AnimatePresence>
            {phase >= 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-sm text-ink-2">
                {nl.next ? (
                  <>
                    <span className="tnum font-semibold text-ink">{nl.gap?.toFixed(1)}</span> points to {LEAGUE_STYLE[nl.next].name}
                  </>
                ) : (
                  "Top league reached"
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {phase >= 4 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mt-8 flex flex-col items-center gap-3 text-center">
            <p className="max-w-xl text-lg text-ink">{L.message}</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-[var(--wf-card-2)] px-3.5 py-1.5 text-sm">
              <Sparkles className="size-4 text-accent-ink" aria-hidden />
              Strongest category: <span className="font-semibold">{CATEGORY_META[strong].name}</span>
              <span className="tnum text-muted">{row[strong].toFixed(0)}/100</span>
            </div>
            <p className="text-xs text-muted">Your rank is not just a number. It’s a starting point for building a stronger financial future.</p>
          </motion.div>
        )}
      </AnimatePresence>
      {phase < 1 && (
        <div className="relative mt-6 flex items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Comparing with {n.toLocaleString("en-CA")} accounts…
        </div>
      )}
    </div>
  );
}
