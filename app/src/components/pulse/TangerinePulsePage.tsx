"use client";

import "../whatif/whatif.css";
import "./pulse.css";
import { motion, useReducedMotion } from "framer-motion";
import { Citrus, Info, Loader2, Move3d, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadFindings, usePromise } from "@/lib/data";
import { loadPulse, milestoneCrossed, NO_PULSE_CHANGES, projectPulse, type PulseChanges, type PulseData } from "@/lib/pulse";
import { loadRank, type RankData } from "@/lib/rank";
import { dataAsOf } from "@/lib/whatif/scenarios";
import { ProvTip } from "../ProvTip";
import { TabBar } from "../ui";
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
  // simulations count forward from the end of the data (Dec 2025), same as the Rank page
  const now = useMemo(() => dataAsOf(), []);
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
  const [milestone, setMilestone] = useState<{ v: number; at: number } | null>(null);
  const [gl, setGl] = useState<boolean | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const [leftTab, setLeftTab] = useState<"why" | "history">("why");
  const [rightTab, setRightTab] = useState<"grow" | "ideas">("grow");

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
    // fewer pixels and particles on small or low-core devices
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
      const url = new URL(window.location.href);
      url.searchParams.set("id", t);
      window.history.replaceState(null, "", url);
      if (rank.byId.has(id)) {
        setLookup({ kind: "ok", id });
        setAppearKey((k) => k + 1);
      } else if (rank.excluded.has(id)) setLookup({ kind: "unavailable", id, reason: rank.excluded.get(id)! });
      else {
        setLookup(null);
        setError(`No account ${t} in accounts.csv. Check the number and try again.`);
      }
    },
    [rank],
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
  // the fruit only ever shows a score computed by the engine: the stored one, or the re-scored projection
  const shown = row && p ? (showing === "original" ? row.score : p.score) : null;

  const update = (c: PulseChanges) => {
    if (rank && row && p) {
      const next = projectPulse(rank, row, c, now).score;
      const hit = milestoneCrossed(p.score, next);
      if (hit !== null) setMilestone({ v: hit, at: Date.now() });
    }
    setChanges(c);
    setShowing("projected");
  };
  useEffect(() => {
    if (!milestone) return;
    const t = setTimeout(() => setMilestone(null), 2600);
    return () => clearTimeout(t);
  }, [milestone]);

  const examples = useMemo(() => {
    if (!rank) return [];
    const ex = (findings?.featured ?? []).filter((f) => rank.byId.has(f.id)).slice(0, 3);
    return ex.length ? ex : rank.rows.filter((_, i) => i % 1500 === 0).map((r) => ({ id: r.id, label: `Account #${r.id}` }));
  }, [rank, findings]);

  /* ---------------- search / unavailable / loading */
  if (!row || !p || !rank)
    return (
      <div className="wf-root pl-root pb-6">
        <header className="pt-6 pb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-ink-2">
            <Citrus className="size-3.5 text-accent-ink" aria-hidden /> Tangerine Pulse
          </div>
          <h1 className="mt-3 text-5xl font-semibold tracking-tighter sm:text-7xl">
            Financial resilience, <span className="wf-gradient-text">in 3D.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">The tangerine fills to an account&apos;s resilience score: the same score as the Rank page, from its Dec 2025 data.</p>
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
          <div className="space-y-5">
            <AccountPulseSearch ready={!!rank && !!pulse} onSubmit={reveal} examples={examples} error={error} />
            {!rank && (
              <div className="flex items-center justify-center gap-2 text-ink-2">
                <Loader2 className="size-5 animate-spin" aria-hidden /> Loading account data…
              </div>
            )}
            {lookup?.kind === "unavailable" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="wf-card mx-auto max-w-2xl p-6 text-center">
                <Info className="mx-auto mb-2 size-6 text-ink-2" aria-hidden />
                <h2 className="text-lg font-semibold">Insufficient account history for account #{lookup.id}</h2>
                <p className="mt-1 text-ink-2">
                  {lookup.reason}. A juice level built on that would be misleading, so no score is shown. Scoring needs typical monthly money in and out above zero and activity from mid-2025.
                </p>
              </motion.div>
            )}
          </div>
        )}
      </div>
    );

  /* ---------------- workspace */
  return (
    <div data-fill className="wf-root pl-root grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(290px,330px)_minmax(0,1fr)_minmax(320px,370px)] lg:grid-rows-[minmax(0,1fr)]">
      {/* left: account, metrics, explanation */}
      <section className="ws-panel p-3" aria-label="Account metrics">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
            <Citrus className="size-4 text-accent-ink" aria-hidden /> Tangerine Pulse
          </h1>
          <span className="tnum text-xs font-semibold">Account #{row.id}</span>
        </div>
        <AccountPulseSearch ready onSubmit={reveal} examples={examples} error={error} compact />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {metrics.map((m) => (
            <FinancialMetricCard key={m.key} m={m} />
          ))}
        </div>
        <TabBar
          idBase="pl-left"
          label="Score explanation"
          value={leftTab}
          onChange={setLeftTab}
          className="mt-2"
          tabs={[
            { value: "why", label: "Score explained" },
            { value: "history", label: "Account history" },
          ]}
        />
        <div id="pl-left-panel" role="tabpanel" aria-labelledby={`pl-left-tab-${leftTab}`} className="ws-scroll mt-2 flex-1 pr-1">
          {leftTab === "why" ? <ResilienceBreakdown data={rank} row={row} p={p} /> : <AccountHistory hist={hist} asOf={rank.meta.asOf} />}
        </div>
      </section>

      {/* centre: the tangerine */}
      <section className="pl-stage relative min-h-[420px] overflow-hidden lg:min-h-0" aria-label="3D tangerine">
        <div className="absolute inset-0" role="img" aria-label={`3D tangerine, ${shown!.toFixed(1)}% full of juice. Drag to rotate, scroll or pinch to zoom.`}>
          {gl === false ? (
            <div className="grid h-full place-items-center pt-16">
              <TangerineFallback score={shown} size={240} />
            </div>
          ) : gl ? (
            <TangerineScene score={shown} reduced={reduced} resetKey={resetCam} appearKey={appearKey} lowPower={lowPower} />
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-2">
          <div className="pointer-events-auto flex items-center gap-1">
            <ResilienceScoreDisplay score={shown} original={row.score} showing={showing} />
          </div>
          <MilestoneToast value={milestone?.v ?? null} />
        </div>
        <div className="pointer-events-none absolute top-3 right-3">
          <span className="pointer-events-auto">
            <ProvTip k="score" extra="Juice level = score %: 72 fills 72% of the fruit's volume. Particles are decorative and never affect a number." />
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-3 flex flex-wrap items-center justify-center gap-2 px-3 text-xs text-muted">
          {gl !== false && (
            <span className="hidden items-center gap-1.5 xl:flex">
              <Move3d className="size-4" aria-hidden /> Drag to rotate · scroll to zoom
            </span>
          )}
          {gl !== false && (
            <button onClick={() => setResetCam((k) => k + 1)} className="btn btn-secondary gap-1 rounded-full px-3 py-1.5">
              <RotateCcw className="size-3.5" aria-hidden /> Reset view
            </button>
          )}
          <button
            onClick={() => {
              setChanges(NO_PULSE_CHANGES);
              setShowing("projected");
            }}
            disabled={!(changes.save || changes.spend || changes.income || changes.extraLoan)}
            className="btn btn-secondary gap-1 rounded-full px-3 py-1.5"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Back to original score
          </button>
          {gl === false && <span>3D isn’t available in this browser, so this is the 2D tangerine with the same juice level.</span>}
        </div>
      </section>

      {/* right: simulator and recommendations */}
      <section className="ws-panel p-3" aria-label="Simulator">
        <JuiceComparison original={row.score} projected={p.score} showing={showing} setShowing={setShowing} />
        <TabBar
          idBase="pl-right"
          label="Simulator"
          value={rightTab}
          onChange={setRightTab}
          className="mt-2"
          tabs={[
            { value: "grow", label: "Grow your juice" },
            { value: "ideas", label: "Recommendations" },
          ]}
        />
        <div id="pl-right-panel" role="tabpanel" aria-labelledby={`pl-right-tab-${rightTab}`} className="ws-scroll mt-2 flex-1 pr-1">
          {rightTab === "grow" ? (
            <GrowYourJuiceSimulator row={row} now={now} changes={changes} setChanges={update} p={p} onReset={() => update(NO_PULSE_CHANGES)} />
          ) : (
            <PulseRecommendations
              data={rank}
              row={row}
              hist={hist}
              now={now}
              onTry={(c) => {
                update(c);
                setRightTab("grow");
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
