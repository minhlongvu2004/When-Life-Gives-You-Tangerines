"use client";

import "./whatif.css";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, GitBranch, Loader2, PenLine, RotateCcw, Search, Shuffle, Target, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadDetail, loadFindings, loadMetrics, usePromise, type AccountDetail } from "@/lib/data";
import type { Metrics } from "@/lib/engine";
import { GOAL_TEMPLATES, newGoal } from "@/lib/whatif/goals";
import { badDefaults, nowYM, SCENARIO_BY_KIND, WELL_DEFAULT, type Assumptions, type Compiled, type ScenarioKind, type Values, type YM } from "@/lib/whatif/scenarios";
import { HORIZONS, loanEndOffset, milestones, simulate, type Goal, type Horizon } from "@/lib/whatif/simulate";
import { guidance, hasUpside, story } from "@/lib/whatif/story";
import { Segmented } from "../ui";
import { FUTURE, FutureDot, Panel, SCENARIO_ICON, SectionHead, Source } from "./bits";
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

export function WhatIf() {
  const now = useMemo(() => nowYM(), []);
  const [metrics, setMetrics] = useState<Map<number, Metrics>>();
  const [loadErr, setLoadErr] = useState(false);
  const findings = usePromise(() => loadFindings().catch(() => null), []);
  const [id, setId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null | undefined>(undefined);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [phase, setPhase] = useState<"setup" | "results">("setup");
  const [h, setH] = useState<Horizon>(12);
  const [replay, setReplay] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

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
      setPhase("setup");
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

  const scrollTop = () => document.querySelector(".wf-root")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const explore = () => {
    setPhase("results");
    setReplay((r) => r + 1);
    scrollTop();
  };

  return (
    <div className="wf-root pb-10" data-no-fit>
      <Hero compact={!!m}>
        {m && (
          <CustomerChip
            m={m}
            detail={detail}
            onClose={close}
          />
        )}
      </Hero>

      {loadErr ? (
        <Panel className="mx-auto max-w-lg text-center">
          <p className="font-semibold">Couldn’t load customer data.</p>
          <p className="mt-1 text-sm text-ink-2">Check your connection and reload the page.</p>
        </Panel>
      ) : !metrics ? (
        <div className="flex items-center justify-center gap-2 py-16 text-ink-2">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Loading 4,500 customers…
        </div>
      ) : !m || !plan || !fx ? (
        <Picker metrics={metrics} featured={findings?.featured ?? []} onOpen={open} />
      ) : phase === "setup" ? (
        <Setup
          m={m}
          plan={plan}
          setPlan={setPlan}
          now={now}
          loanEndsAt={loanEndsAt}
          compiled={fx.compiled}
          showUpside={hasUpside(fx.well)}
          showAssumptions={showAssumptions}
          setShowAssumptions={setShowAssumptions}
          detailMissing={detail === null}
          onExplore={explore}
        />
      ) : (
        <Results
          fx={fx}
          m={m}
          h={h}
          setH={setH}
          now={now}
          replay={replay}
          loanEndsAt={loanEndsAt}
          onEdit={() => {
            setPhase("setup");
            scrollTop();
          }}
          onRewrite={() => setSheet(true)}
        />
      )}

      <AnimatePresence>
        {sheet && m && plan && (
          <RewriteSheet
            m={m}
            plan={plan}
            now={now}
            loanEndsAt={loanEndsAt}
            onClose={() => setSheet(false)}
            onApply={(p) => {
              setPlan(p);
              setSheet(false);
              setReplay((r) => r + 1);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ hero + customer */

function Hero({ compact, children }: { compact: boolean; children?: ReactNode }) {
  return (
    <motion.div layout className={`text-center ${compact ? "pt-4 pb-6" : "pt-10 pb-8"}`}>
      <div className="inline-flex items-center gap-2 rounded-full border border-line bg-[var(--wf-card-2)] px-3 py-1 text-xs font-medium text-ink-2">
        <GitBranch className="size-3.5 text-[var(--wf-violet-ink)]" aria-hidden /> Financial future explorer
      </div>
      <h1 className={`wf-gradient-text mt-4 font-semibold tracking-tighter ${compact ? "text-5xl sm:text-6xl" : "text-6xl sm:text-8xl"}`}>What If?</h1>
      <p className={`mx-auto mt-3 max-w-xl text-ink-2 ${compact ? "text-base" : "text-lg"}`}>One decision. Two possible futures. Explore where life could take you.</p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </motion.div>
  );
}

function CustomerChip({ m, detail, onClose }: { m: Metrics; detail: AccountDetail | null | undefined; onClose: () => void }) {
  const who = detail?.owner
    ? `${detail.owner.gender === "F" ? "Woman" : detail.owner.gender === "M" ? "Man" : "Customer"}${detail.owner.age ? `, ${detail.owner.age}` : ""} · ${detail.region}`
    : m.region;
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-[var(--wf-card-2)] py-1.5 pr-1.5 pl-4 text-sm">
      <span className="tnum font-semibold">#{m.id}</span>
      <span className="hidden text-ink-2 sm:inline">· {who}</span>
      <button onClick={onClose} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" aria-label="Change customer">
        <X className="size-4" />
      </button>
    </div>
  );
}

function Picker({ metrics, featured, onOpen }: { metrics: Map<number, Metrics>; featured: { id: number; label: string }[]; onOpen: (n: number) => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const go = () => {
    const n = Number(v.trim());
    if (!metrics.has(n)) return setErr("No customer with that ID. Try one of the examples below.");
    onOpen(n);
  };
  const all = [...metrics.keys()];
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-xl text-center">
      <p className="text-ink-2">Start with a real customer. Their income, spending and savings become the starting point for both futures.</p>
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
        />
        <button className="wf-cta flex items-center gap-1.5 rounded-xl px-5 py-2.5 font-semibold text-white">
          Go <ArrowRight className="size-4" aria-hidden />
        </button>
      </form>
      {err && <p className="mt-3 text-sm text-critical-text">{err}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
        {featured.slice(0, 3).map((f) => (
          <button key={f.id} onClick={() => onOpen(f.id)} className="btn btn-secondary rounded-full px-3.5 py-1.5">
            {f.label}
          </button>
        ))}
        <button onClick={() => onOpen(all[Math.floor(Math.random() * all.length)])} className="btn btn-outline rounded-full px-3 py-1.5">
          <Shuffle className="size-3.5" aria-hidden /> Surprise me
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ setup */

function StartingPoint({ m, detailMissing }: { m: Metrics; detailMissing: boolean }) {
  const rows: [string, number, string][] = [
    ["Money in", m.I, "/mo"],
    ["Money out", m.S, "/mo"],
    ["Savings today", m.B, ""],
    ["Household bills", m.H, "/mo"],
    ["Flexible spending", m.disc, "/mo"],
  ];
  if (m.P > 0) rows.push(["Loan payment", m.P, "/mo"]);
  const surplus = m.I - m.S;
  return (
    <Panel className="h-full">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Your starting point</h3>
        <Source kind="data" />
      </div>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v, u]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-ink-2">{k}</dt>
            <dd className="tnum font-semibold">
              ${Math.round(v).toLocaleString("en-CA")}
              {u && <span className="font-normal text-muted">{u}</span>}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-line pt-2">
          <dt className="text-ink-2">Usual monthly {surplus >= 0 ? "surplus" : "shortfall"}</dt>
          <dd className={`tnum font-semibold ${surplus >= 0 ? "text-good-text" : "text-critical-text"}`}>
            {surplus >= 0 ? "+" : "−"}${Math.round(Math.abs(surplus)).toLocaleString("en-CA")}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Medians of this account’s monthly history (2020–2025). Savings = average daily balance over its last 6 months.
        {detailMissing && " Loan dates couldn't be loaded, so an existing loan is assumed to keep running."}
      </p>
    </Panel>
  );
}

function Setup({
  m,
  plan,
  setPlan,
  now,
  loanEndsAt,
  compiled,
  showUpside,
  showAssumptions,
  setShowAssumptions,
  detailMissing,
  onExplore,
}: {
  m: Metrics;
  plan: Plan;
  setPlan: (p: Plan) => void;
  now: YM;
  loanEndsAt: number | null;
  compiled: Compiled;
  showUpside: boolean;
  showAssumptions: boolean;
  setShowAssumptions: (v: boolean) => void;
  detailMissing: boolean;
  onExplore: () => void;
}) {
  const def = SCENARIO_BY_KIND[plan.kind];
  const a = assumptionsOf(plan, plan.kind);
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Panel>
        <SectionHead n="1" title="Choose a What If" sub="Pick the life decision you're thinking about." />
        <ScenarioPicker value={plan.kind} onChange={(k) => setPlan({ ...plan, kind: k })} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel>
          <SectionHead
            n="2"
            title={def.title}
            sub="Your best estimates. Both futures start from these numbers."
            right={<Source kind="input" />}
          />
          <ScenarioForm def={def} values={valuesOf(plan, plan.kind, m, now)} compiled={compiled} now={now} onChange={(v) => setPlan({ ...plan, values: { ...plan.values, [plan.kind]: v } })} />
        </Panel>
        <StartingPoint m={m} detailMissing={detailMissing} />
      </div>

      <Panel>
        <SectionHead n="3" title="What do you want to achieve along the way?" sub="Add as many goals as you like. We'll show when each future gets you there." />
        <GoalsEditor goals={plan.goals} onChange={(g) => setPlan({ ...plan, goals: g })} m={m} now={now} loanEndsAt={loanEndsAt} />
      </Panel>

      <Panel>
        <button onClick={() => setShowAssumptions(!showAssumptions)} className="flex w-full items-center gap-3 text-left" aria-expanded={showAssumptions}>
          <span className="grid size-7 place-items-center rounded-full bg-[var(--wf-violet-soft)] text-sm font-semibold text-[var(--wf-violet-ink)] ring-1 ring-[var(--wf-violet)]/40">4</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-semibold tracking-tight">How the two futures differ</span>
            <span className="block text-sm text-ink-2">
              Optional. <span style={{ color: FUTURE.well.ink }}>Going well</span> means things happen as planned;{" "}
              <span style={{ color: FUTURE.bad.ink }}>going badly</span> means delays and overruns.
            </span>
          </span>
          <ChevronDown className={`size-5 shrink-0 transition-transform ${showAssumptions ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {showAssumptions && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="pt-5">
                <AssumptionsEditor
                  def={def}
                  well={a.well}
                  bad={a.bad}
                  showUpside={showUpside}
                  onChange={(w, x) => setPlan({ ...plan, assumptions: { ...plan.assumptions, [plan.kind]: { ...a, [w]: x } } })}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>

      <div className="flex flex-col items-center gap-2 pt-2">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={onExplore}
          className="wf-cta flex items-center gap-2.5 rounded-2xl px-8 py-4 text-lg font-semibold text-white"
        >
          <GitBranch className="size-5" aria-hidden /> Explore My Futures
        </motion.button>
        <p className="text-xs text-muted">Deterministic simulation. No random numbers, no AI guesses.</p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ results */

function Results({
  fx,
  m,
  h,
  setH,
  now,
  replay,
  loanEndsAt,
  onEdit,
  onRewrite,
}: {
  fx: NonNullable<ReturnType<typeof useFutures>>;
  m: Metrics;
  h: Horizon;
  setH: (h: Horizon) => void;
  now: YM;
  replay: number;
  loanEndsAt: number | null;
  onEdit: () => void;
  onRewrite: () => void;
}) {
  const Icon = SCENARIO_ICON[fx.def.kind];
  return (
    <div className="space-y-6">
      {/* toolbar */}
      <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-[var(--surface)]/85 px-3 py-2 shadow-lg backdrop-blur-xl">
        <button onClick={onEdit} className="btn btn-outline rounded-full px-2.5 py-1.5 text-sm">
          <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Setup</span>
        </button>
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0 text-accent-ink" aria-hidden />
          <span className="truncate">{fx.def.title}</span>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented<string>
            size="sm"
            value={String(h)}
            onChange={(v) => setH(Number(v) as Horizon)}
            options={HORIZONS.map((x) => ({
              value: String(x),
              label: (
                <span className="whitespace-nowrap">
                  {x}
                  <span className="hidden sm:inline"> Months</span>
                  <span className="sm:hidden"> mo</span>
                </span>
              ),
              title: `Project ${x} months ahead`,
            }))}
          />
          <button onClick={onRewrite} className="wf-cta flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white">
            <PenLine className="size-4" aria-hidden /> Rewrite My Future
          </button>
        </div>
      </div>

      <Panel>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Your branching futures</h2>
          <p className="text-sm text-ink-2">
            You decide to {fx.decision}.
          </p>
        </div>
        <FutureMap kind={fx.def.kind} title={fx.def.short} well={fx.well} bad={fx.bad} wellMs={fx.wellMs} badMs={fx.badMs} h={h} now={now} replay={replay} />
      </Panel>

      <FutureCards well={fx.well} bad={fx.bad} h={h} now={now} wellMs={fx.wellMs} badMs={fx.badMs} />

      <div className="grid gap-6 xl:grid-cols-2">
        <SavingsChart well={fx.well} bad={fx.bad} h={h} now={now} />
        <GoalTimeline well={fx.well} bad={fx.bad} h={h} now={now} />
      </div>

      <section>
        <div className="mb-4 flex items-center gap-2.5">
          <BookOpen className="size-5 text-[var(--wf-violet-ink)]" aria-hidden />
          <h2 className="text-xl font-semibold tracking-tight">Two stories from one decision</h2>
        </div>
        <StoryView well={fx.wellStory} bad={fx.badStory} />
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2.5">
          <Target className="size-5 text-accent-ink" aria-hidden />
          <h2 className="text-xl font-semibold tracking-tight">Personalized guidance</h2>
        </div>
        <GuidanceView good={fx.tips.good} bad={fx.tips.bad} />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold tracking-tight">What’s real and what’s assumed</h2>
        <Transparency m={m} def={fx.def} values={fx.values} well={fx.a.well} bad={fx.a.bad} loanEndsAt={loanEndsAt} now={now} showUpside={hasUpside(fx.well)} />
      </section>

      <div className="flex justify-center pt-2">
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} onClick={onRewrite} className="wf-cta flex items-center gap-2.5 rounded-2xl px-8 py-4 text-lg font-semibold text-white">
          <PenLine className="size-5" aria-hidden /> Rewrite My Future
        </motion.button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rewrite sheet */

const TABS = [
  { key: "decision", label: "Decision" },
  { key: "goals", label: "Goals" },
  { key: "futures", label: "Futures" },
] as const;

function RewriteSheet({
  m,
  plan,
  now,
  loanEndsAt,
  onClose,
  onApply,
}: {
  m: Metrics;
  plan: Plan;
  now: YM;
  loanEndsAt: number | null;
  onClose: () => void;
  onApply: (p: Plan) => void;
}) {
  const [draft, setDraft] = useState<Plan>(plan);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("decision");
  const def = SCENARIO_BY_KIND[draft.kind];
  const values = valuesOf(draft, draft.kind, m, now);
  const compiled = def.compile(values, m, now);
  const a = assumptionsOf(draft, draft.kind);
  const showUpside = useMemo(() => hasUpside(simulate({ m, compiled, a: a.well, goals: [], now, loanEndsAt })), [m, compiled, a.well, now, loanEndsAt]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <motion.div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Rewrite My Future"
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-line bg-[var(--page)] shadow-2xl"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 300 }}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <PenLine className="size-5 text-accent-ink" aria-hidden />
          <h3 className="text-lg font-semibold">Rewrite My Future</h3>
          <button onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="border-b border-line px-5 py-3">
          <Segmented<string> value={tab} onChange={(v) => setTab(v as typeof tab)} options={TABS.map((t) => ({ value: t.key, label: t.label }))} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {tab === "decision" && (
            <div className="space-y-6">
              <ScenarioPicker compact value={draft.kind} onChange={(k) => setDraft({ ...draft, kind: k })} />
              <div className="wf-card p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="font-semibold">{def.title}</span>
                  <button
                    onClick={() => {
                      const rest = { ...draft.values };
                      delete rest[draft.kind];
                      setDraft({ ...draft, values: rest });
                    }}
                    className="flex items-center gap-1 text-xs text-muted hover:text-ink"
                  >
                    <RotateCcw className="size-3.5" aria-hidden /> Reset
                  </button>
                </div>
                <ScenarioForm def={def} values={values} compiled={compiled} now={now} onChange={(v) => setDraft({ ...draft, values: { ...draft.values, [draft.kind]: v } })} />
              </div>
            </div>
          )}
          {tab === "goals" && <GoalsEditor goals={draft.goals} onChange={(g) => setDraft({ ...draft, goals: g })} m={m} now={now} loanEndsAt={loanEndsAt} />}
          {tab === "futures" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-ink-2">Change what “going well” and “going badly” mean for this decision.</p>
                <button
                  onClick={() => {
                    const rest = { ...draft.assumptions };
                    delete rest[draft.kind];
                    setDraft({ ...draft, assumptions: rest });
                  }}
                  className="flex shrink-0 items-center gap-1 text-xs text-muted hover:text-ink"
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Reset
                </button>
              </div>
              <AssumptionsEditor
                def={def}
                well={a.well}
                bad={a.bad}
                showUpside={showUpside}
                onChange={(w, x) => setDraft({ ...draft, assumptions: { ...draft.assumptions, [draft.kind]: { ...a, [w]: x } } })}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-5 py-4">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <FutureDot which="well" size={7} />
            <FutureDot which="bad" size={7} />
            {dirty ? "Both futures will be recalculated" : "No changes yet"}
          </span>
          <button onClick={onClose} className="btn btn-outline ml-auto rounded-full px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => onApply(draft)}
            disabled={!dirty}
            className="wf-cta flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <GitBranch className="size-4" aria-hidden /> Apply & rewrite
          </button>
        </div>
      </motion.aside>
    </>
  );
}
