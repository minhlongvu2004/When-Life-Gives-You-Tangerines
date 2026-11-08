"use client";

import "../whatif/whatif.css";
import "./pulse.css";
import { motion, useReducedMotion } from "framer-motion";
import { Citrus, Info, Loader2, Move3d, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadFindings, usePromise } from "@/lib/data";
import { loadPulse, milestoneCrossed, NO_PULSE_CHANGES, projectPulse, type PulseChanges, type PulseData } from "@/lib/pulse";
import { loadRank, type RankData } from "@/lib/rank";
import { nowYM } from "@/lib/whatif/scenarios";
import {
  AccountHistory,
  AccountPulseSearch,
  buildMetrics,
  FinancialMetricCard,
  GrowYourJuiceSimulator,
  JuiceComparison,
  MilestoneToast,
  PulseRecommendations,
  ResilienceBreakdown,
  ResilienceScoreDisplay,
} from "./panels";
import { TangerineFallback } from "./TangerineFallback";

// The 3D scene is loaded only in the browser, after the page; the 2D fruit shows meanwhile.
const TangerineScene = dynamic(() => import("./TangerineScene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <TangerineFallback score={null} size={220} />
    </div>
  ),
});

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Lookup = { kind: "ok"; id: number } | { kind: "unavailable"; id: number; reason: string } | null;

export function TangerinePulsePage() {
  const now = useMemo(() => nowYM(), []);
  const reduced = !!useReducedMotion();
  const [rank, setRank] = useState<RankData>();
  const [pulse, setPulse] = useState<PulseData>();
  const [loadErr, setLoadErr] = useState(false);
  const findings = usePromise(() => loadFindings().catch(() => null), []);
  const [lookup, setLookup] = useState<Lookup>(null);
  const [error, setError] = useState("");
  const [changes, setChanges] = useState<PulseChanges>(NO_PULSE_CHANGES);
  const [showing, setShowing] = useState<"projected" | "original">("projected");
  const [resetCam, setResetCam] = useState(0);
  const [appearKey, setAppearKey] = useState(0);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [gl, setGl] = useState<boolean | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastScore = useRef<number | null>(null);

  const load = useCallback(() => {
    setLoadErr(false);
    Promise.all([loadRank(), loadPulse()])
      .then(([r, p]) => {
        setRank(r);
        setPulse(p);
      })
      .catch(() => setLoadErr(true));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    setGl(hasWebGL());
    setLowPower(window.matchMedia("(max-width: 640px)").matches || (navigator.hardwareConcurrency ?? 8) <= 4);
  }, []);

  const reveal = useCallback(
    (raw: string) => {
      if (!rank) return;
      const t = raw.trim();
      if (!/^\d{1,9}$/.test(t)) return setError("Account IDs are numbers only, like 20134.");
      const id = Number(t);
      setError("");
      setChanges(NO_PULSE_CHANGES);
      setShowing("projected");
      setMilestone(null);
      lastScore.current = null;
      const url = new URL(window.location.href);
      url.searchParams.set("id", t);
      window.history.replaceState(null, "", url);
      if (rank.byId.has(id)) {
        setLookup({ kind: "ok", id });
        setAppearKey((k) => k + 1);
        stageRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      } else if (rank.excluded.has(id)) setLookup({ kind: "unavailable", id, reason: rank.excluded.get(id)! });
      else {
        setLookup(null);
        setError(`We couldn’t find account ${t}. Check the number and try again.`);
      }
    },
    [rank, reduced],
  );

  useEffect(() => {
    if (!rank || lookup) return;
    const q = new URLSearchParams(window.location.search).get("id");
    if (q) reveal(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rank]);

  const row = lookup?.kind === "ok" ? rank?.byId.get(lookup.id) : undefined;
  const hist = row ? pulse?.byId.get(row.id) : undefined;
  const p = useMemo(() => (rank && row ? projectPulse(rank, row, changes, now) : null), [rank, row, changes, now]);
  const metrics = useMemo(() => (row && p ? buildMetrics(row, p) : []), [row, p]);
  const shown = row && p ? (showing === "original" ? row.score : p.score) : null;

  // milestone moments: only when the projected score climbs past 50 / 75 / 90
  useEffect(() => {
    if (!p) return;
    const prev = lastScore.current;
    lastScore.current = p.score;
    if (prev === null) return;
    const m = milestoneCrossed(prev, p.score);
    if (m === null) return;
    setMilestone(m);
    const id = setTimeout(() => setMilestone(null), 2600);
    return () => clearTimeout(id);
  }, [p]);

  const examples = useMemo(() => {
    if (!rank) return [];
    const ex = (findings?.featured ?? []).filter((f) => rank.byId.has(f.id)).slice(0, 3);
    return ex.length ? ex : rank.rows.filter((_, i) => i % 1500 === 0).map((r) => ({ id: r.id, label: `#${r.id}` }));
  }, [rank, findings]);

  return (
    <div className="wf-root pl-root pb-14" data-no-fit>
      <header className={`text-center ${row ? "pt-3 pb-5" : "pt-8 pb-6"}`}>
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-ink-2">
          <Citrus className="size-3.5 text-accent-ink" aria-hidden /> Tangerine Pulse
        </div>
        <h1 className={`mt-3 font-semibold tracking-tighter ${row ? "text-4xl sm:text-5xl" : "text-5xl sm:text-7xl"}`}>
          Your Financial Health, <span className="wf-gradient-text">Alive.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-2">Watch your financial resilience come to life. Every financial decision makes a difference.</p>
      </header>

      {loadErr ? (
        <div className="wf-card mx-auto max-w-lg p-6 text-center">
          <p className="font-semibold">Couldn’t load the account data.</p>
          <p className="mt-1 text-sm text-ink-2">Check your connection and try again.</p>
          <button onClick={load} className="wf-cta mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white">
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          <AccountPulseSearch ready={!!rank && !!pulse} onSubmit={reveal} examples={examples} error={error} compact={!!row} />

          {!rank && (
            <div className="flex items-center justify-center gap-2 text-ink-2">
              <Loader2 className="size-5 animate-spin" aria-hidden /> Loading account data…
            </div>
          )}

          {lookup?.kind === "unavailable" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="wf-card mx-auto max-w-2xl p-6 text-center">
              <Info className="mx-auto mb-2 size-6 text-ink-2" aria-hidden />
              <h2 className="text-lg font-semibold">Not enough data for account {lookup.id}</h2>
              <p className="mt-1 text-ink-2">
                {lookup.reason}. A juice level built on that would be misleading, so this tangerine stays empty. Scoring needs typical monthly money in and out above zero and activity
                from mid-2025.
              </p>
            </motion.div>
          )}

          {/* the experience: the stage stays in view while you adjust the simulator below it */}
          <div className="relative">
            <div ref={stageRef} className="sticky top-0 z-20 scroll-mt-2 pb-3 sm:top-2">
              <div className="pl-stage relative h-[42vh] min-h-[300px] overflow-hidden sm:h-[clamp(420px,58vh,600px)]">
                {/* the fruit fills the whole stage, behind everything else */}
                <div className="absolute inset-0" role="img" aria-label={`3D tangerine${shown !== null ? `, ${shown.toFixed(1)}% full of juice` : ", empty"}. Drag to rotate, scroll or pinch to zoom.`}>
                  {gl === false ? (
                    <div className="grid h-full place-items-center pt-20">
                      <TangerineFallback score={shown} size={220} />
                    </div>
                  ) : gl ? (
                    <TangerineScene score={shown} reduced={reduced} resetKey={resetCam} appearKey={appearKey} lowPower={lowPower} />
                  ) : null}
                </div>
                {/* overlays: drags pass through to the fruit except over the cards and buttons */}
                <div className="pointer-events-none relative grid h-full grid-cols-1 lg:grid-cols-[13.5rem_1fr_13.5rem] lg:gap-6 lg:px-5">
                  <div className="pointer-events-auto hidden flex-col justify-center gap-4 lg:flex">
                    {metrics.slice(0, 2).map((m) => (
                      <FinancialMetricCard key={m.key} m={m} side="left" />
                    ))}
                  </div>
                  <div className="relative min-h-0">
                    <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-2">
                      <ResilienceScoreDisplay score={shown} original={row?.score ?? null} showing={showing} />
                      <MilestoneToast value={milestone} />
                    </div>
                    <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3 text-xs text-muted">
                      {gl !== false && (
                        <>
                          <span className="hidden items-center gap-1.5 sm:flex">
                            <Move3d className="size-4" aria-hidden /> Drag to rotate · scroll to zoom
                          </span>
                          <button onClick={() => setResetCam((k) => k + 1)} className="btn btn-secondary pointer-events-auto gap-1 rounded-full px-3 py-1.5">
                            <RotateCcw className="size-3.5" aria-hidden /> Reset view
                          </button>
                        </>
                      )}
                      {gl === false && <span>3D isn’t available in this browser, so here’s the 2D tangerine with the same juice level.</span>}
                    </div>
                  </div>
                  <div className="pointer-events-auto hidden flex-col justify-center gap-4 lg:flex">
                    {metrics.slice(2).map((m) => (
                      <FinancialMetricCard key={m.key} m={m} side="right" />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {row && p && rank && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:hidden">
                  {metrics.map((m) => (
                    <FinancialMetricCard key={m.key} m={m} />
                  ))}
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <GrowYourJuiceSimulator
                    row={row}
                    now={now}
                    changes={changes}
                    setChanges={(c) => {
                      setChanges(c);
                      setShowing("projected");
                    }}
                    p={p}
                    onReset={() => {
                      setChanges(NO_PULSE_CHANGES);
                      setShowing("projected");
                    }}
                  />
                  <div className="space-y-6">
                    <JuiceComparison original={row.score} projected={p.score} showing={showing} setShowing={setShowing} />
                    <div className="wf-card p-4 text-xs leading-relaxed text-muted">
                      <p>
                        <span className="font-semibold text-ink-2">Same score as the Rank page.</span> 40% Savings Buffer + 25% Cash Flow + 20% Income Stability + 15% Debt Burden, from
                        this account’s monthly summaries, loans and standing orders. A custom datathon index, not an official Tangerine score or a credit score.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {row && p && rank && (
            <>
              <ResilienceBreakdown data={rank} row={row} p={p} />
              <PulseRecommendations
                data={rank}
                row={row}
                hist={hist}
                now={now}
                onTry={(c) => {
                  setChanges(c);
                  setShowing("projected");
                  stageRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                }}
              />
              <AccountHistory hist={hist} asOf={rank.meta.asOf} />
              <p className="text-center text-sm text-ink-2">Your financial resilience is something you can grow. Watch every improvement bring your Tangerine back to life.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
