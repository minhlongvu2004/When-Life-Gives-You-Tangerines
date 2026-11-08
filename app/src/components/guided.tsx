"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  CloudLightning,
  Flame,
  Home,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { backupPlan, formatRunway, goalPlan, money, NO_SHOCK, pct, scenario, verdict, type Metrics, type Mode, type Shock } from "@/lib/engine";
import { parseTwist } from "@/lib/twist";
import type { MonthRow } from "@/lib/data";
import { BalanceChart, InOutChart } from "./charts";
import { Slider, Toggle } from "./ui";

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
  good: { ring: "var(--good)", text: "text-good-text", soft: "bg-good-soft", Icon: CheckCircle2, word: "Safe" },
  warning: { ring: "var(--warning)", text: "text-ink", soft: "bg-warning-soft", Icon: ShieldCheck, word: "Tight" },
  critical: { ring: "var(--critical)", text: "text-critical-text", soft: "bg-critical-soft", Icon: XCircle, word: "At risk" },
};

export const PRESETS: { key: string; title: string; sub: string; Icon: LucideIcon; shock: Shock }[] = [
  { key: "job", title: "Laid off", sub: "EI pays 55% · 6 months", Icon: Briefcase, shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 } },
  { key: "furnace", title: "Furnace dies", sub: "Costs 1 month of spending", Icon: Flame, shock: { ...NO_SHOCK, oneOffMult: 1 } },
  {
    key: "combo",
    title: "Laid off + bills up",
    sub: "EI 55% · bills +15%",
    Icon: CloudLightning,
    shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, billsPct: 0.15, durationMonths: 6 },
  },
  { key: "rent", title: "Rent goes up", sub: "Bills +15%", Icon: Home, shock: { ...NO_SHOCK, billsPct: 0.15, durationMonths: 12 } },
];

export function shockLabel(s: Shock): string {
  const parts: string[] = [];
  if (s.jobLoss) parts.push(`laid off, EI ${pct(s.incomePct)}`);
  else if (s.incomePct !== 1) parts.push(`income ${pct(s.incomePct)} of usual`);
  if (s.billsPct) parts.push(`bills +${pct(s.billsPct)}`);
  if (s.extraMonthly) parts.push(`+${money(s.extraMonthly)}/mo`);
  if (s.oneOffMult) parts.push(`${s.oneOffMult === 1 ? "a" : s.oneOffMult + "×"} month of spending one-off`);
  if (s.oneOffAbs) parts.push(`${money(s.oneOffAbs)} one-off`);
  const out = parts.join(" + ");
  return out ? out[0].toUpperCase() + out.slice(1) : "";
}
const isShock = (s: Shock) => shockLabel(s) !== "";

/* ------------------------------------------------------------------ primitives */

/** Ring = progress toward a 6-month safety cushion (the length of a typical EI claim). */
export function RunwayRing({
  runway,
  size = 200,
  caption,
  label,
}: {
  runway: number | null; // months; null = no shortfall (120+)
  size?: number;
  caption?: string;
  label?: string;
}) {
  const tone = toneOf(runway);
  const t = TONE[tone];
  const stroke = size < 160 ? 10 : 14;
  const numCls = size < 160 ? "text-4xl" : size < 200 ? "text-5xl" : "text-6xl";
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
            key={months(runway)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className={`tnum font-semibold tracking-tighter ${numCls}`}
          >
            {months(runway)}
          </motion.div>
          <div className={`mt-0.5 max-w-[70%] leading-tight text-ink-2 ${size < 160 ? "text-xs" : "text-sm"}`}>
            {label ?? (runway === null ? "months · no shortfall" : "months of runway")}
          </div>
          <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.soft} ${t.text}`}>
            <t.Icon className="size-3.5" aria-hidden /> {caption ?? t.word}
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
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3.5 py-2 text-sm text-ink-2 transition-colors hover:border-accent hover:text-ink"
      >
        {icon}
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/10"
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
      className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-page shadow-lg shadow-black/10 transition hover:-translate-y-0.5"
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
            caption={bufMonths >= 6 ? "Well cushioned" : bufMonths >= 3 ? "Thin cushion" : "Very thin cushion"}
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
  all,
  onNext,
}: {
  m: Metrics;
  mode: Mode;
  setMode: (m: Mode) => void;
  shock: Shock;
  setShock: (s: Shock) => void;
  all: Metrics[];
  onNext: () => void;
}) {
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<string[]>([]);
  const base = scenario(m, NO_SHOCK, mode);
  const sc = scenario(m, shock, mode);
  const other = scenario(m, shock, mode === "judge" ? "realistic" : "judge");
  const v = verdict(sc, shock.durationMonths);
  const has = isShock(shock);

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
    ? "Type the twist card, tap a scenario, or drag the sliders."
    : v.wipedOut
      ? `They're ${k(v.shortToday)} short the day it hits.`
      : v.survives
        ? `${k(Math.max(0, v.spare))} of savings left at the end.`
        : `That's ${v.monthsShort.toFixed(1)} months short. They'd need ${k(v.moneyNeeded)} more saved.`;

  return (
    <div className="space-y-3">
      {/* twist bar */}
      <div>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-sm focus-within:border-accent">
          <Sparkles className="size-5 shrink-0 text-accent" aria-hidden />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && read()}
            placeholder="Read the twist card… e.g. “They lose their job (EI at 55%) and bills go up 15%”"
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted"
            aria-label="Twist card"
          />
          <button onClick={read} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
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
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = JSON.stringify(p.shock) === JSON.stringify(shock);
            return (
              <button
                key={p.key}
                onClick={() => {
                  setShock(p.shock);
                  setHeard([]);
                }}
                title={p.sub}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                  active ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface/70 text-ink-2 hover:border-accent/60 hover:text-ink"
                }`}
              >
                <p.Icon className="size-4" aria-hidden />
                {p.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* sliders (left) drive the result (right) */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold">Shape the shock</div>
          <ShockSliders m={m} shock={shock} setShock={setShock} income={sc.income} />
        </div>

        <div
          className={`flex flex-col justify-center rounded-3xl border bg-surface p-6 shadow-sm ${has ? "border-accent/40 ring-4 ring-accent-soft" : "border-line"}`}
        >
          <div className="flex items-center gap-6">
            <RunwayRing runway={sc.runway} size={170} caption={has ? (v.survives ? "Makes it" : v.wipedOut ? "Wiped out" : "Runs out") : undefined} />
            <div className="min-w-0">
              {has && (
                <div className="text-sm font-medium text-accent-ink">
                  {shockLabel(shock)} · was {months(base.runway)} mo
                </div>
              )}
              <h2 className="mt-1 text-3xl leading-tight font-semibold tracking-tight">{headline}</h2>
              <p className="mt-2 text-ink-2">{sub}</p>
            </div>
          </div>
          {has && (
            <>
              <div className="mt-5 rounded-xl bg-surface-2 px-4 py-2.5 font-mono text-sm text-ink-2" title="runway = (savings − one-off) ÷ (spending − income)">
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
  );
}

function ShockSliders({ m, shock, setShock, income }: { m: Metrics; shock: Shock; setShock: (s: Shock) => void; income: number }) {
  const set = (p: Partial<Shock>) => setShock({ ...shock, ...p });
  return (
    <div className="grid gap-y-3">
      <div>
        <Toggle
          checked={shock.jobLoss}
          onChange={(on) => set(on ? { jobLoss: true, incomePct: shock.incomePct === 1 ? 0.55 : shock.incomePct } : { jobLoss: false, incomePct: 1 })}
          label="Job loss (EI)"
        />
      </div>
      <Slider
        label={shock.jobLoss ? "EI pays" : "Income after shock"}
        value={shock.incomePct}
        min={0}
        max={1}
        step={0.05}
        onChange={(x) => set({ incomePct: x })}
        display={`${Math.round(shock.incomePct * 100)}% · ${money(income)}/mo`}
      />
      <Slider
        label="Bills / rent"
        value={shock.billsPct}
        min={0}
        max={0.5}
        step={0.01}
        onChange={(x) => set({ billsPct: x })}
        display={`+${Math.round(shock.billsPct * 100)}% · +${money(shock.billsPct * m.H)}/mo`}
      />
      <Slider
        label="Extra per month"
        value={shock.extraMonthly}
        min={0}
        max={3000}
        step={50}
        onChange={(x) => set({ extraMonthly: x })}
        display={`+${money(shock.extraMonthly)}/mo`}
      />
      <Slider
        label="One-off (× spending)"
        value={shock.oneOffMult}
        min={0}
        max={3}
        step={0.25}
        onChange={(x) => set({ oneOffMult: x })}
        display={`${shock.oneOffMult}× · ${money(shock.oneOffMult * m.S)}`}
      />
      <Slider
        label="One-off ($)"
        value={shock.oneOffAbs}
        min={0}
        max={20000}
        step={250}
        onChange={(x) => set({ oneOffAbs: x })}
        display={money(shock.oneOffAbs)}
      />
      <Slider
        label="Lasts"
        value={shock.durationMonths}
        min={1}
        max={24}
        step={1}
        onChange={(x) => set({ durationMonths: x })}
        display={`${shock.durationMonths} months`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ step 3 */

export function StepPlan({ m, mode, shock, onRestart }: { m: Metrics; mode: Mode; shock: Shock; onRestart: () => void }) {
  const has = isShock(shock);
  const eff: Shock = has ? shock : { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };
  const steps = backupPlan(m, eff, mode);
  const first = steps[0];
  const last = steps[steps.length - 1];
  const dur = has ? shock.durationMonths : 6;
  const ok = last.runway === null || last.runway >= dur;
  const g = goalPlan(m, mode, 0.5);
  const useFast = g.fastMonths !== null && (g.monthsToGoal === null || g.monthsToGoal > 18) && g.fastMonths < (g.monthsToGoal ?? Infinity);
  const save = useFast ? g.fastMonthly : g.monthly;
  const when = useFast ? g.fastMonths : g.monthsToGoal;
  const progress = g.target > 0 ? Math.min(1, Math.max(0, g.current / g.target)) : 1;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Two plans, built from their own numbers.</h2>
        <p className="mt-1 text-ink-2">One for the day it hits. One to be ready before it does.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* backup */}
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <div className="text-sm font-medium text-accent-ink">If it hits{has ? ` · ${shockLabel(shock)}` : " · a layoff"}</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tnum text-5xl font-semibold tracking-tighter">{months(first.runway)}</span>
            <ArrowRight className="size-6 self-center text-muted" aria-hidden />
            <span className={`tnum text-5xl font-semibold tracking-tighter ${ok ? "text-good-text" : "text-critical-text"}`}>{months(last.runway)}</span>
            <span className="text-ink-2">months</span>
          </div>
          <div
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${ok ? "bg-good-soft text-good-text" : "bg-critical-soft text-critical-text"}`}
          >
            {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
            {ok ? `Makes it through ${dur} months` : last.runway === 0 ? "Savings can't cover the bill" : `Still short of ${dur} months`}
          </div>
          <ol className="mt-4 space-y-2">
            {eff.jobLoss && <PlanStep n={1} title="Apply for EI right away" detail="Within 4 weeks of the last day of work" />}
            {steps.slice(1).map((s, i) => (
              <PlanStep
                key={s.label}
                n={i + (eff.jobLoss ? 2 : 1)}
                title={s.label}
                detail={s.detail}
                gain={s.gained === null ? "no shortfall" : s.gained > 0 ? `+${s.gained.toFixed(1)} mo` : undefined}
              />
            ))}
          </ol>
          {!ok && (
            <p className="mt-4 text-sm text-ink-2">
              {last.runway === 0
                ? "Monthly cuts can't pay a bill due today. Spread the repair over a payment plan, and build the fund on the right."
                : "Cuts alone aren't enough. The real fix is the fund on the right."}
            </p>
          )}
        </div>

        {/* goal */}
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <div className="text-sm font-medium text-accent-ink">Get ready · emergency fund</div>
          {g.shortfall === 0 ? (
            <>
              <div className="mt-3 text-5xl font-semibold tracking-tighter text-good-text">Funded</div>
              <p className="mt-2 text-ink-2">
                Their {k(g.current)} already covers the {k(g.target)} goal. Keep it in a high-interest savings account.
              </p>
            </>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="tnum text-5xl font-semibold tracking-tighter">{save > 0 ? k(save) : "—"}</span>
                <span className="text-ink-2">a month</span>
              </div>
              <p className="mt-1 text-ink-2">
                {when !== null ? (
                  <>
                    → fully ready in <b className="text-ink">{when} months</b>
                  </>
                ) : (
                  "First, stop the monthly shortfall."
                )}
              </p>
              <div className="mt-5">
                <div className="mb-1.5 flex justify-between text-xs text-ink-2">
                  <span>{k(g.current)} saved</span>
                  <span>Goal {k(g.target)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-accent-soft">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
                <li>• Goal = {g.targetReason}.</li>
                {g.surplus > 0 && (
                  <li>
                    • Save half of the {k(g.surplus)} monthly surplus{useFast && <> plus 10% of flexible spending ({k(g.fastMonthly - g.monthly)})</>}.
                  </li>
                )}
                {g.cutNeeded > 0 && <li>• Trim flexible spending {Math.round(g.cutNeeded * 100)}% to stop the monthly shortfall first.</li>}
                <li>• Automate it: transfer the day after payday.</li>
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="text-center">
        <button onClick={onRestart} className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-2 hover:text-ink">
          Try another customer →
        </button>
      </div>
    </div>
  );
}

function PlanStep({ n, title, detail, gain }: { n: number; title: string; detail: string; gain?: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted">{detail}</div>
      </div>
      {gain && <span className="tnum shrink-0 rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good-text">{gain}</span>}
    </li>
  );
}
