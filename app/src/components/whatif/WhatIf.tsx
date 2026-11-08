"use client";

import "./whatif.css";
import { motion } from "framer-motion";
import { ArrowRight, GitBranch, Loader2, RotateCcw, Search, Shuffle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadDetail, loadFindings, loadMetrics, usePromise, type AccountDetail } from "@/lib/data";
import type { Metrics } from "@/lib/engine";
import { GOAL_TEMPLATES, newGoal } from "@/lib/whatif/goals";
import { badDefaults, dataAsOf, SCENARIO_BY_KIND, WELL_DEFAULT, type Assumptions, type ScenarioKind, type Values, type YM } from "@/lib/whatif/scenarios";
import { HORIZONS, loanEndOffset, milestones, simulate, type Goal, type Horizon } from "@/lib/whatif/simulate";
import { guidance, hasUpside, story } from "@/lib/whatif/story";
import { ProvTip } from "../ProvTip";
import { Segmented, TabBar } from "../ui";
import { FUTURE, Panel, SCENARIO_ICON, Source } from "./bits";
import { FutureMap } from "./FutureMap";
import { AssumptionsEditor, GoalsEditor, ScenarioForm, ScenarioPicker } from "./inputs";
import { FutureCards, GoalTimeline, GuidanceView, SavingsChart, StoryView, Transparency } from "./results";

interface Plan {
  kind: ScenarioKind;
  values: Partial<Record<ScenarioKind, Values>>;
  assumptions: Partial<Record<ScenarioKind, { well: Assumptions; bad: Assumptions }>>;
  goals: Goal[];
}

const valuesOf = (p: Plan, k: ScenarioKind, m: Metrics, now: YM) => p.values[k] ?? SCENARIO_BY_KIND[k].defaults(m, now);
const assumptionsOf = (p: Plan, k: ScenarioKind) => p.assumptions[k] ?? { well: WELL_DEFAULT, bad: badDefaults(k) };

function initialPlan(m: Metrics, now: YM): Plan {
  return { kind: "job", values: {}, assumptions: {}, goals: [newGoal(GOAL_TEMPLATES[0], m, now, null)] };
}

/** Everything the results need, derived from a plan. Pure and deterministic. */
function useFutures(plan: Plan | null, m: Metrics | undefined, now: YM, loanEndsAt: number | null, h: number) {
  return useMemo(() => {
    if (!plan || !m) return null;
    const def = SCENARIO_BY_KIND[plan.kind];
    const values = valuesOf(plan, plan.kind, m, now);
    const compiled = def.compile(values, m, now);
    const a = assumptionsOf(plan, plan.kind);
    const base = { m, compiled, goals: plan.goals, now, loanEndsAt };
    const well = simulate({ ...base, a: a.well });
    const bad = simulate({ ...base, a: a.bad });
    const decision = def.decision(values, m, now);
    const ctx = { def, decision, m, now, h, well, bad };
    return {
      def,
      values,
      compiled,
      a,
      well,
      bad,
      decision,
      wellMs: milestones(well, h, def.short),
      badMs: milestones(bad, h, def.short),
      wellStory: story("well", ctx),
      badStory: story("bad", ctx),
      tips: guidance(ctx),
    };
  }, [plan, m, now, loanEndsAt, h]);
}

type LeftTab = "decision" | "goals" | "futures";
type RightTab = "outcomes" | "story" | "guidance" | "sources";

export function WhatIf() {
  // Both futures start from the account's latest data (Dec 2025), so month 1 is Jan 2026.
  const now = useMemo(() => dataAsOf(), []);
  const [metrics, setMetrics] = useState<Map<number, Metrics>>();
  const [loadErr, setLoadErr] = useState(false);
  const findings = usePromise(() => loadFindings().catch(() => null), []);
  const [id, setId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null | undefined>(undefined);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [h, setH] = useState<Horizon>(12);
  const [replay, setReplay] = useState(0);
  const [left, setLeft] = useState<LeftTab>("decision");
  const [right, setRight] = useState<RightTab>("outcomes");

  useEffect(() => {
    loadMetrics()
      .then(setMetrics)
      .catch(() => setLoadErr(true));
  }, []);

  const open = useCallback(
    (n: number) => {
      const mm = metrics?.get(n);
      if (!mm) return;
      setId(n);
      setDetail(undefined);
      setPlan(initialPlan(mm, now));
      setReplay((r) => r + 1);
      const url = new URL(window.location.href);
      url.searchParams.set("id", String(n));
      window.history.replaceState(null, "", url);
    },
    [metrics, now],
  );
  const close = () => {
    setId(null);
    setPlan(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    if (!metrics || id !== null) return;
    const q = Number(new URLSearchParams(window.location.search).get("id"));
    if (q && metrics.has(q)) open(q);
  }, [metrics, id, open]);

  useEffect(() => {
    if (id === null) return;
    let alive = true;
    loadDetail(id)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [id]);

  const m = id !== null ? metrics?.get(id) : undefined;
  const loanEndsAt = useMemo(() => (m && m.P > 0 ? loanEndOffset(now, detail?.loan) : null), [m, detail, now]);
  const fx = useFutures(plan, m, now, loanEndsAt, h);

  if (!m || !plan || !fx)
    return (
      <div className="wf-root pb-6">
        <Hero />
        {loadErr ? (
          <Panel className="mx-auto max-w-lg text-center">
            <p className="font-semibold">Couldn’t load account data.</p>
            <p className="mt-1 text-sm text-ink-2">Check your connection and reload the page.</p>
          </Panel>
        ) : !metrics ? (
          <div className="flex items-center justify-center gap-2 py-10 text-ink-2">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Loading 4,500 accounts…
          </div>
        ) : (
          <Picker metrics={metrics} featured={findings?.featured ?? []} onOpen={open} />
        )}
      </div>
    );

  const def = fx.def;
  const a = fx.a;
  const showUpside = hasUpside(fx.well);
  const Icon = SCENARIO_ICON[def.kind];
  const resetKind = (what: "values" | "assumptions") => {
    const rest = { ...plan[what] };
    delete rest[plan.kind];
    setPlan({ ...plan, [what]: rest });
  };

  return (
    <div data-fill className="wf-root grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(310px,350px)_minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[minmax(0,1fr)]">
      {/* ---------------- left: scenario selection and inputs */}
      <section className="ws-panel p-3" aria-label="Scenario inputs">
        <div className="flex items-center justify-between gap-2">
          <h1 className="wf-gradient-text text-xl font-semibold tracking-tight">What If?</h1>
          <div className="flex min-w-0 items-center gap-1 rounded-full border border-line bg-[var(--wf-card-2)] py-0.5 pr-0.5 pl-2.5 text-xs">
            <span className="tnum truncate font-semibold">Account #{m.id}</span>
            <button onClick={close} className="grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" aria-label="Change account">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
        <StartingPoint m={m} detailMissing={detail === null} />
        <TabBar
          idBase="wi-left"
          label="Scenario inputs"
          value={left}
          onChange={setLeft}
          className="mt-2"
          tabs={[
            { value: "decision", label: "Decision" },
            { value: "goals", label: `Goals (${plan.goals.length})` },
            { value: "futures", label: "Good / bad" },
          ]}
        />
        <div id="wi-left-panel" role="tabpanel" aria-labelledby={`wi-left-tab-${left}`} className="ws-scroll mt-2 flex-1 pr-1">
          {left === "decision" && (
            <div className="space-y-3">
              <ScenarioPicker mini value={plan.kind} onChange={(k) => setPlan({ ...plan, kind: k })} />
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Icon className="size-4 text-accent-ink" aria-hidden /> {def.title}
                </span>
                <Source kind="input" />
              </div>
              <p className="text-[11px] text-muted">Your estimates. Defaults are round example values (or scaled from this account&apos;s medians where noted); replace them with your own.</p>
              <ScenarioForm def={def} values={fx.values} compiled={fx.compiled} now={now} onChange={(v) => setPlan({ ...plan, values: { ...plan.values, [plan.kind]: v } })} />
              <button onClick={() => resetKind("values")} className="btn btn-outline rounded-full px-3 py-1 text-xs">
                <RotateCcw className="size-3" aria-hidden /> Reset to defaults
              </button>
            </div>
          )}
          {left === "goals" && <GoalsEditor goals={plan.goals} onChange={(g) => setPlan({ ...plan, goals: g })} m={m} now={now} loanEndsAt={loanEndsAt} />}
          {left === "futures" && (
            <div className="space-y-2">
              <p className="text-xs text-ink-2">
                <span style={{ color: FUTURE.well.ink }}>Goes well</span> = things happen as planned; <span style={{ color: FUTURE.bad.ink }}>goes badly</span> = delays and overruns. Explicit
                assumptions, not probabilities.
              </p>
              <AssumptionsEditor def={def} well={a.well} bad={a.bad} showUpside={showUpside} onChange={(w, x) => setPlan({ ...plan, assumptions: { ...plan.assumptions, [plan.kind]: { ...a, [w]: x } } })} />
              <button onClick={() => resetKind("assumptions")} className="btn btn-outline rounded-full px-3 py-1 text-xs">
                <RotateCcw className="size-3" aria-hidden /> Reset assumptions
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- centre: the branching futures */}
      <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-label="Branching futures">
        <div className="ws-panel shrink-0 p-3">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <GitBranch className="size-4 text-[var(--wf-violet-ink)]" aria-hidden /> Two hypothetical futures <ProvTip k="whatifFuture" />
            </h2>
            <div className="ml-auto flex items-center gap-1.5">
              <Segmented<string>
                size="sm"
                value={String(h)}
                onChange={(v) => setH(Number(v) as Horizon)}
                options={HORIZONS.map((x) => ({ value: String(x), label: `${x} mo`, title: `Project ${x} months after Dec 2025` }))}
              />
              <button onClick={() => setReplay((r) => r + 1)} className="btn btn-outline size-7 rounded-full p-0" aria-label="Replay the animation" title="Replay">
                <RotateCcw className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
          <p className="mb-1 line-clamp-2 text-xs text-ink-2" title={`Suppose you ${fx.decision}.`}>
            Suppose you {fx.decision}.
          </p>
          <FutureMap kind={def.kind} title={def.short} well={fx.well} bad={fx.bad} wellMs={fx.wellMs} badMs={fx.badMs} h={h} now={now} replay={replay} />
        </div>
        <div className="ws-panel min-h-[260px] flex-1 p-3 lg:min-h-0">
          <SavingsChart well={fx.well} bad={fx.bad} h={h} now={now} />
        </div>
      </section>

      {/* ---------------- right: outcomes, stories, guidance */}
      <section className="ws-panel p-3" aria-label="Outcomes">
        <TabBar
          idBase="wi-right"
          label="Outcome details"
          value={right}
          onChange={setRight}
          tabs={[
            { value: "outcomes", label: "Outcomes" },
            { value: "story", label: "Story" },
            { value: "guidance", label: "Guidance" },
            { value: "sources", label: "Sources" },
          ]}
        />
        <div id="wi-right-panel" role="tabpanel" aria-labelledby={`wi-right-tab-${right}`} className="ws-scroll mt-2 flex-1 pr-1" aria-live="polite">
          {right === "outcomes" && (
            <div className="space-y-3">
              <FutureCards well={fx.well} bad={fx.bad} h={h} now={now} wellMs={fx.wellMs} badMs={fx.badMs} />
              <GoalTimeline well={fx.well} bad={fx.bad} h={h} now={now} />
            </div>
          )}
          {right === "story" && (
            <div>
              <p className="mb-2 text-[11px] text-muted">Every sentence reads its numbers from the simulation above. Possibilities under stated assumptions, not predictions.</p>
              <StoryView well={fx.wellStory} bad={fx.badStory} />
            </div>
          )}
          {right === "guidance" && <GuidanceView good={fx.tips.good} bad={fx.tips.bad} />}
          {right === "sources" && <Transparency m={m} def={def} values={fx.values} well={a.well} bad={a.bad} loanEndsAt={loanEndsAt} now={now} showUpside={showUpside} />}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ hero + picker */

function Hero() {
  return (
    <div className="pt-6 pb-6 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-line bg-[var(--wf-card-2)] px-3 py-1 text-xs font-medium text-ink-2">
        <GitBranch className="size-3.5 text-[var(--wf-violet-ink)]" aria-hidden /> Financial future explorer
      </div>
      <h1 className="wf-gradient-text mt-4 text-6xl font-semibold tracking-tighter sm:text-8xl">What If?</h1>
      <p className="mx-auto mt-3 max-w-xl text-lg text-ink-2">One decision. Two hypothetical futures, built from a real account&apos;s history.</p>
    </div>
  );
}

function Picker({ metrics, featured, onOpen }: { metrics: Map<number, Metrics>; featured: { id: number; label: string }[]; onOpen: (n: number) => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const go = () => {
    const t = v.trim();
    if (!/^\d{1,9}$/.test(t)) return setErr("Account IDs are numbers only, like 52783.");
    if (!metrics.has(Number(t))) return setErr(`No account ${t} in accounts.csv. Try one of the examples below.`);
    onOpen(Number(t));
  };
  const all = [...metrics.keys()];
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-xl text-center">
      <p className="text-ink-2">Start with a real account. Its income, spending and Dec 2025 savings become the starting point for both futures.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="wf-card mx-auto mt-6 flex max-w-md items-center gap-2 p-2 pl-4 focus-within:border-accent"
      >
        <Search className="size-5 text-muted" aria-hidden />
        <input
          autoFocus
          inputMode="numeric"
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            setErr("");
          }}
          placeholder="Enter an account ID"
          className="tnum min-w-0 flex-1 bg-transparent py-2 text-lg outline-none placeholder:text-muted"
          aria-label="Account ID"
          aria-invalid={!!err}
        />
        <button className="wf-cta flex items-center gap-1.5 rounded-xl px-5 py-2.5 font-semibold text-white">
          Go <ArrowRight className="size-4" aria-hidden />
        </button>
      </form>
      {err && (
        <p className="mt-3 text-sm text-critical-text" role="alert">
          {err}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
        {featured.slice(0, 3).map((f) => (
          <button key={f.id} onClick={() => onOpen(f.id)} className="btn btn-secondary rounded-full px-3.5 py-1.5">
            {f.label}
          </button>
        ))}
        <button onClick={() => onOpen(all[Math.floor(Math.random() * all.length)])} className="btn btn-outline rounded-full px-3 py-1.5" title="Opens a real account chosen at random">
          <Shuffle className="size-3.5" aria-hidden /> Surprise me
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ starting point */

function StartingPoint({ m, detailMissing }: { m: Metrics; detailMissing: boolean }) {
  const rows: [string, number, string][] = [
    ["Money in", m.I, "/mo"],
    ["Money out", m.S, "/mo"],
    ["Savings", m.B, ""],
    ["Bills", m.H, "/mo"],
    ["Flexible", m.disc, "/mo"],
  ];
  if (m.P > 0) rows.push(["Loan", m.P, "/mo"]);
  const surplus = m.I - m.S;
  return (
    <div className="mt-2 rounded-xl bg-[var(--wf-card-2)] px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold">
          Starting point · Dec 2025 <ProvTip k="whatifStart" />
        </span>
        <Source kind="data" />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {rows.map(([k, v, u]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="truncate text-ink-2">{k}</dt>
            <dd className="tnum font-semibold whitespace-nowrap">
              {v < 0 ? "−" : ""}${Math.round(Math.abs(v)).toLocaleString("en-CA")}
              {u && <span className="font-normal text-muted">{u}</span>}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <dt className="text-ink-2">{surplus >= 0 ? "Surplus" : "Shortfall"}</dt>
          <dd className={`tnum font-semibold ${surplus >= 0 ? "text-good-text" : "text-critical-text"}`}>
            {surplus >= 0 ? "+" : "−"}${Math.round(Math.abs(surplus)).toLocaleString("en-CA")}
          </dd>
        </div>
      </dl>
      {detailMissing && <p className="mt-1 text-[11px] text-muted">Loan dates unavailable, so an existing loan is assumed to keep running.</p>}
    </div>
  );
}
