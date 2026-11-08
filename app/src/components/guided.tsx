"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatRunway, NO_SHOCK, scenario, verdict, type Metrics, type Mode, type Shock } from "@/lib/engine";
import { effectiveShock, planCards, type PlanCard } from "@/lib/planCards";
import { isShock, shockLabel, ymLabel } from "@/lib/shocks";
import { parseTwist } from "@/lib/twist";
import type { MonthRow } from "@/lib/data";
import { parseYM, type YM } from "@/lib/whatif/scenarios";
import { BalanceChart, InOutChart } from "./charts";
import { CustomShocks } from "./shock/CustomShocks";
import { ShockControls } from "./shock/ShockFields";
import { ShockImpact } from "./shock/ShockImpact";
import { ShockLibrary } from "./shock/ShockLibrary";
import { PlanCardView, ShockStrip } from "./PlanCards";

/* ------------------------------------------------------------------ helpers */

export interface Peers {
  fifth: string;
  bufferMonthsPctile: number;
  fifthMedianBufferMonths: number;
}

const k = (x: number) => {
  const a = Math.abs(x);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}K` : `$${Math.round(a)}`;
  return x < 0 ? `−${s}` : s;
};
const months = (r: number | null) => (r === null ? "120+" : formatRunway(r));

const GOAL_MONTHS = 6;
type Tone = "good" | "warning" | "critical";
const toneOf = (r: number | null, target = 6): Tone => (r === null || r >= target ? "good" : r >= 3 ? "warning" : "critical");
const TONE = {
  good: { ring: "var(--good)" },
  warning: { ring: "var(--warning)" },
  critical: { ring: "var(--critical)" },
};

export { shockLabel };

/* ------------------------------------------------------------------ primitives */

/** Ring = progress toward a 6-month safety cushion (the length of a typical EI claim). */
export function RunwayRing({
  runway,
  size = 200,
  label,
  word,
}: {
  runway: number | null; // months; null = no shortfall (120+)
  size?: number;
  label?: string;
  word?: string; // replaces the number, e.g. "Covered" when the shock never drains savings
}) {
  const tone = toneOf(runway);
  const t = TONE[tone];
  const stroke = size < 160 ? 10 : 14;
  const numCls = word ? (size < 200 ? "text-3xl" : "text-4xl") : size < 160 ? "text-4xl" : size < 200 ? "text-5xl" : "text-6xl";
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = runway === null ? 1 : Math.min(Math.max(runway, 0), GOAL_MONTHS) / GOAL_MONTHS;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={t.ring}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - frac) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <motion.div
            key={word ?? months(runway)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className={`tnum font-semibold tracking-tighter ${numCls}`}
          >
            {word ?? months(runway)}
          </motion.div>
          <div className={`mt-0.5 max-w-[70%] leading-tight text-ink-2 ${size < 160 ? "text-xs" : "text-sm"}`}>
            {label ?? (runway === null ? "months · no shortfall" : "months of runway")}
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs whitespace-nowrap text-muted">Full ring = {GOAL_MONTHS}-month safety cushion</div>
    </div>
  );
}

export function Disclosure({ label, children, icon }: { label: string; children: ReactNode; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-surface/70">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-5 py-3.5 text-sm font-medium text-ink-2 hover:text-ink">
        {icon}
        {label}
        <ChevronDown className={`ml-auto size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A pill that opens a right-hand side panel, so details never push the page down. */
export function SheetButton({ label, icon, title, children, wide }: { label: string; icon?: ReactNode; title?: string; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-secondary rounded-full px-3.5 py-2 text-sm"
      >
        {icon}
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-[var(--overlay)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-label={title ?? label}
              className={`fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
            >
              <div className="flex items-center justify-between border-b border-line px-6 py-4">
                <h3 className="text-base font-semibold">{title ?? label}</h3>
                <button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function NextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-primary group gap-2 rounded-full px-6 py-3 text-sm"
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ step 1 */

export function StepCustomer({ m, rows, peers, mode, onNext }: { m: Metrics; rows: MonthRow[]; peers: Peers | null; mode: Mode; onNext: () => void }) {
  const base = scenario(m, NO_SHOCK, mode);
  const bufMonths = m.S > 0 ? m.B / m.S : 0;
  const surplus = m.I - m.S;
  const headline =
    base.runway === 0
      ? "Already out of savings."
      : base.runway === null
        ? surplus > 0
          ? bufMonths < 3
            ? `Saving ${k(surplus)} a month, on a thin cushion.`
            : `Saving ${k(surplus)} a month.`
          : "Breaking even every month."
        : `Spending ${k(base.gap)} more than they earn, every month.`;
  const story =
    base.runway === null
      ? `Their savings would cover ${bufMonths.toFixed(1)} months of normal spending if income stopped.`
      : `At this pace their ${k(m.B)} of savings lasts ${months(base.runway)} months.`;

  return (
    <div className="space-y-4">
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="mx-auto">
          <RunwayRing
            runway={Math.round(bufMonths * 10) / 10}
            size={180}
            label="months of spending saved"
          />
        </div>
        <div>
          <div className="text-sm font-medium text-accent-ink">Today, with no shock</div>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h2>
          <p className="mt-3 text-lg text-ink-2">{story}</p>
          {peers && (
            <p className="mt-2 text-ink-2">
              Similar earners keep <b className="text-ink">{peers.fifthMedianBufferMonths.toFixed(1)} months</b> of spending saved.
            </p>
          )}
          <div className="mt-5 grid grid-cols-3 gap-4 rounded-2xl border border-line bg-surface/70 px-4 py-4 sm:grid-cols-5">
            <Kpi label="Money in" value={k(m.I)} sub="per month" />
            <Kpi label="Fixed costs" value={k(m.F)} sub={`bills ${k(m.H)} · loan ${k(m.P)}`} />
            <Kpi label="Money out" value={k(m.S)} sub="per month" />
            <Kpi label="Savings" value={k(m.B)} sub="avg, last 6 mo" />
            <Kpi
              label="Runway"
              value={base.runway === null ? "120+" : `${months(base.runway)} mo`}
              sub={base.runway === null ? "no shortfall" : "at this pace"}
            />
          </div>
          <div className="mt-5">
            <NextButton onClick={onNext}>Hit them with a shock</NextButton>
          </div>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="grid gap-5 rounded-3xl border border-line bg-surface p-5 shadow-sm md:grid-cols-2">
          <InOutChart rows={rows} />
          <BalanceChart rows={rows} buffer={m.B} />
        </div>
      ) : (
        <div className="h-56 animate-pulse rounded-3xl bg-surface" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ step 2 */

export function StepShock({
  m,
  mode,
  setMode,
  shock,
  setShock,
  start,
  setStart,
  now,
  all,
  onNext,
}: {
  m: Metrics;
  mode: Mode;
  setMode: (m: Mode) => void;
  shock: Shock;
  setShock: (s: Shock) => void;
  start: string | null;
  setStart: (s: string | null) => void;
  now: YM;
  all: Metrics[];
  onNext: () => void;
}) {
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<string[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);
  const base = scenario(m, NO_SHOCK, mode);
  const sc = scenario(m, shock, mode);
  const other = scenario(m, shock, mode === "judge" ? "realistic" : "judge");
  const v = verdict(sc, shock.durationMonths);
  const has = isShock(shock);
  // the shock costs them something, but they still earn more than they spend, so savings never drain
  const covered = has && sc.runway === null && sc.bufferLeft > 0;
  const lostIncome = m.I - sc.income;
  const extraCost = sc.spending - m.S;
  const coveredWhat = [
    lostIncome > 0.5 && `income drops ${k(lostIncome)} a month`,
    extraCost > 0.5 && `monthly costs rise ${k(extraCost)}`,
    sc.oneOff > 0 && `a ${k(sc.oneOff)} one-off bill comes out of savings`,
  ].filter(Boolean) as string[];

  const share = useMemo(() => {
    if (!has) return 0;
    let n = 0;
    for (const x of all) {
      const r = scenario(x, shock, mode).runway;
      if (r !== null && r < shock.durationMonths) n++;
    }
    return n / all.length;
  }, [all, shock, mode, has]);

  const read = () => {
    const p = parseTwist(text);
    setHeard(p.understood.length ? p.understood : ["Didn't catch that. Pick a twist below or adjust it by hand."]);
    if (p.understood.length) setShock(p.shock);
  };

  const headline = !has
    ? "What happens to them?"
    : v.wipedOut
      ? "The bill alone wipes out their savings."
      : v.survives
        ? `They make it through ${shock.durationMonths} months.`
        : `They run out of money in month ${Math.max(1, Math.ceil(sc.runway ?? 0))}.`;
  const sub = !has
    ? "Type the twist card, pick a scenario, or set the values by hand."
    : v.wipedOut
      ? `They're ${k(v.shortToday)} short the day it hits.`
      : v.survives
        ? `${k(Math.max(0, v.spare))} of savings left at the end.`
        : `That's ${v.monthsShort.toFixed(1)} months short. They'd need ${k(v.moneyNeeded)} more saved.`;

  return (
    <div data-no-fit className="space-y-4 pb-8">
      {/* twist bar */}
      <div>
        <div className="glass-card flex items-center gap-2 rounded-2xl p-2 pl-4 focus-within:border-accent">
          <Sparkles className="size-5 shrink-0 text-accent" aria-hidden />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && read()}
            placeholder="Read the twist card… e.g. “They lose their job (EI at 55%) and bills go up 15%”"
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted"
            aria-label="Twist card"
          />
          <button onClick={read} className="btn btn-primary rounded-xl px-5 py-2.5 text-sm">
            Apply
          </button>
        </div>
        <AnimatePresence>
          {heard.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 flex flex-wrap gap-1.5 pl-1">
              {heard.map((h) => (
                <span key={h} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent-ink">
                  {h}
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <ShockLibrary
            m={m}
            shock={shock}
            onPick={(s) => {
              setShock(s);
              setHeard([]);
            }}
          />
          <CustomShocks
            m={m}
            mode={mode}
            shock={shock}
            start={start}
            now={now}
            onRun={(s, st) => {
              setShock(s);
              setStart(st);
              setHeard([]);
              requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
          />
          <section className="glass-card p-4 sm:p-5" aria-labelledby="shape-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="shape-title" className="flex items-center gap-2 text-base font-semibold">
                  <SlidersHorizontal className="size-4 text-accent-ink" aria-hidden /> Shape the shock
                </h2>
                <p className="text-sm text-ink-2">Every value is an assumption you can change. Tap ? to see what it means.</p>
              </div>
              {has && (
                <button onClick={() => setShock(NO_SHOCK)} className="btn btn-outline rounded-full px-3 py-1.5 text-xs">
                  Clear shock
                </button>
              )}
            </div>
            <ShockControls m={m} shock={shock} setShock={setShock} income={sc.income} />
          </section>
        </div>

        {/* the verdict stays in view while scenarios and values change */}
        <div ref={resultRef} className="min-w-0 scroll-mt-3 lg:sticky lg:top-3">
          <div className={`glass-card flex flex-col p-5 transition-shadow sm:p-6 ${has ? "border-accent/40 ring-4 ring-accent-soft" : ""}`}>
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left lg:flex-col lg:text-center">
              <RunwayRing runway={sc.runway} size={170} word={covered ? "Covered" : undefined} label={covered ? "income still covers spending" : undefined} />
              <div className="min-w-0">
                {has && (
                  <div className="text-sm font-medium text-accent-ink">
                    {shockLabel(shock)} · was {months(base.runway)} mo
                  </div>
                )}
                <h2 className="mt-1 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{headline}</h2>
                <p className="mt-2 text-ink-2">{sub}</p>
              </div>
            </div>
            {covered && (
              <div className="mt-4 rounded-xl bg-good-soft px-4 py-3 text-sm text-ink">
                <b className="text-good-text">What it does to them:</b>{" "}
                {coveredWhat.length ? `${coveredWhat.join(", ").replace(/^./, (c) => c.toUpperCase())}, but` : "Nothing changes, and"} they still keep{" "}
                <b>{k(Math.max(0, sc.income - sc.spending))}</b> a month, so savings never go down.
              </div>
            )}
            {has && (
              <>
                <div className="mt-5 rounded-xl bg-surface-2 px-4 py-2.5 font-mono text-sm break-words text-ink-2" title="runway = (savings − one-off) ÷ (spending − income)">
                  {sc.bufferLeft <= 0
                    ? `${k(m.B)} savings − ${k(sc.oneOff)} one-off ≤ 0  →  0 months`
                    : sc.gap <= 0
                      ? `income ${k(sc.income)} ≥ spending ${k(sc.spending)}  →  no shortfall`
                      : `${k(sc.bufferLeft)} ÷ (${k(sc.spending)} − ${k(sc.income)})  =  ${months(sc.runway)} months`}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
                  <span>
                    <b className="text-ink">{Math.round(share * 100)}%</b> of all {all.length.toLocaleString()} customers wouldn&apos;t last{" "}
                    {shock.durationMonths} months
                  </span>
                  {(shock.jobLoss || mode === "realistic") && (
                    <button
                      onClick={() => setMode(mode === "judge" ? "realistic" : "judge")}
                      className="underline decoration-dotted underline-offset-4 hover:text-ink"
                      title="Realistic: EI capped at $729/week (2026) and pensions keep paying"
                    >
                      {mode === "judge" ? "With the real EI cap" : "With the judges' formula"}: <b className="tnum text-ink">{months(other.runway)} mo</b>
                    </button>
                  )}
                </div>
                <div className="mt-5">
                  <NextButton onClick={onNext}>Make a plan</NextButton>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {has && <ShockImpact m={m} shock={shock} mode={mode} start={start} setStart={setStart} now={now} />}
    </div>
  );
}

/* ------------------------------------------------------------------ step 3 */

export function StepPlan({
  m,
  mode,
  shock,
  start,
  now,
}: {
  m: Metrics;
  mode: Mode;
  shock: Shock;
  start: string | null;
  now: YM;
}) {
  const eff = effectiveShock(shock);
  const cards = planCards(m, eff, mode);
  // "Hits today" unless the shock was set to start in a later month (the numbers don't change)
  const s = start ? parseYM(start) : null;
  const later = s && (s.y !== now.y || s.m !== now.m) ? `Hits ${ymLabel(s)}` : null;
  const hit = (c: PlanCard): PlanCard => (later ? { ...c, timing: later } : c);

  return (
    <div className="mx-auto flex w-full max-w-[1132px] flex-col">
      <div className="text-center">
        <h2 className="text-[clamp(24px,2.6vw,30px)] font-bold tracking-[-0.03em]">
          {eff.jobLoss ? "If they lose their job, how long does their money last?" : "If this hits, how long does their money last?"}
        </h2>
        <ShockStrip shock={eff} cards={cards} />
      </div>

      <div className="mt-5 grid gap-[18px] md:grid-cols-3 md:grid-rows-[auto_auto_auto_auto] md:gap-y-0">
        <PlanCardView kind="nothing" card={hit(cards.nothing)} durationMonths={cards.durationMonths} />
        <PlanCardView kind="short" card={hit(cards.short)} durationMonths={cards.durationMonths} />
        <PlanCardView kind="long" card={cards.long} durationMonths={cards.durationMonths} />
      </div>
    </div>
  );
}
