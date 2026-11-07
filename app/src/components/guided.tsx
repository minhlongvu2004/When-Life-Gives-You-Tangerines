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
  SlidersHorizontal,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { MonthRow } from "@/lib/data";
import {
  backupPlan,
  EI_MONTHLY_CAP,
  formatRunway,
  goalPlan,
  money,
  NO_SHOCK,
  pct,
  scenario,
  verdict,
  type Metrics,
  type Mode,
  type Scenario,
  type Shock,
} from "@/lib/engine";
import { parseTwist } from "@/lib/twist";
import { BalanceChart, DepletionChart, InOutChart } from "./charts";
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
  { key: "combo", title: "Laid off + bills up", sub: "EI 55% · bills +15%", Icon: CloudLightning, shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, billsPct: 0.15, durationMonths: 6 } },
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

export function RunwayRing({ runway, size = 232, caption }: { runway: number | null; size?: number; caption?: string }) {
  const tone = toneOf(runway);
  const t = TONE[tone];
  const stroke = 14;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = runway === null ? 1 : Math.min(runway, 12) / 12;
  return (
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
        {/* 6-month mark */}
        <line x1={size - stroke * 1.6} y1={size / 2} x2={size - 2} y2={size / 2} stroke="var(--ink-2)" strokeWidth={2} transform={`rotate(180 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.div key={months(runway)} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="tnum text-6xl font-semibold tracking-tighter">
          {months(runway)}
        </motion.div>
        <div className="mt-0.5 text-sm text-ink-2">{runway === null ? "months · no shortfall" : "months of runway"}</div>
        <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.soft} ${t.text}`}>
          <t.Icon className="size-3.5" aria-hidden /> {caption ?? t.word}
        </div>
      </div>
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

export function StepCustomer({
  m,
  rows,
  peers,
  mode,
  onNext,
}: {
  m: Metrics;
  rows: MonthRow[];
  peers: Peers | null;
  mode: Mode;
  onNext: () => void;
}) {
  const base = scenario(m, NO_SHOCK, mode);
  const bufMonths = m.S > 0 ? m.B / m.S : 0;
  const surplus = m.I - m.S;
  const headline =
    base.runway === 0
      ? "Already out of savings."
      : base.runway === null
        ? surplus > 0
          ? `Saving ${k(surplus)} a month.`
          : "Breaking even every month."
        : `Spending ${k(base.gap)} more than they earn, every month.`;
  const story =
    base.runway === null
      ? `Their savings would cover ${bufMonths.toFixed(1)} months of normal spending if income stopped.`
      : `At this pace their ${k(m.B)} of savings lasts ${months(base.runway)} months.`;

  return (
    <div className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
      <div className="mx-auto">
        <RunwayRing runway={base.runway} caption={base.runway === null ? "Healthy today" : undefined} />
      </div>
      <div>
        <div className="text-sm font-medium text-accent-ink">Today, with no shock</div>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h2>
        <p className="mt-3 text-lg text-ink-2">{story}</p>
        {peers && (
          <p className="mt-2 text-ink-2">
            Similar earners keep <b className="text-ink">{peers.fifthMedianBufferMonths.toFixed(1)} months</b> saved. This customer keeps{" "}
            <b className="text-ink">{bufMonths.toFixed(1)}</b>.
          </p>
        )}
        <div className="mt-7 grid grid-cols-3 gap-4 rounded-2xl border border-line bg-surface/70 px-4 py-5">
          <Kpi label="Money in" value={k(m.I)} sub="per month" />
          <Kpi label="Money out" value={k(m.S)} sub="per month" />
          <Kpi label="Savings" value={k(m.B)} sub={`${bufMonths.toFixed(1)} months`} />
        </div>
        <div className="mt-7">
          <NextButton onClick={onNext}>Hit them with a shock</NextButton>
        </div>
      </div>
      <div className="md:col-span-2">
        <Disclosure label="See the full money picture">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            {[
              ["I", "Typical money in", m.I],
              ["F", "Fixed costs (bills + insurance + loan)", m.F],
              ["S", "Typical spending", m.S],
              ["B", "Savings buffer (last 6 months)", m.B],
              ["H", "Household bills", m.H],
              ["P", "Loan payment", m.P],
            ].map(([code, label, v]) => (
              <div key={code as string} className="flex items-baseline justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <span className="text-ink-2">
                  <span className="mr-1.5 font-mono text-xs text-accent-ink">{code}</span>
                  {label}
                </span>
                <span className="tnum font-semibold">{money(v as number)}</span>
              </div>
            ))}
          </div>
          {rows.length > 0 && (
            <div className="mt-6 grid gap-8 lg:grid-cols-2">
              <InOutChart rows={rows} />
              <BalanceChart rows={rows} buffer={m.B} />
            </div>
          )}
        </Disclosure>
      </div>
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
  path,
  all,
  onNext,
}: {
  m: Metrics;
  mode: Mode;
  setMode: (m: Mode) => void;
  shock: Shock;
  setShock: (s: Shock) => void;
  path: { month: number; balance: number; baseline: number; plan?: number }[];
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
    ? "Pick what happens to them."
    : v.wipedOut
      ? "The bill alone wipes out their savings."
      : v.survives
        ? `They make it through ${shock.durationMonths} months.`
        : `They run out of money in month ${Math.max(1, Math.ceil(sc.runway ?? 0))}.`;
  const sub = !has
    ? "Read the twist card, or tap a scenario."
    : v.wipedOut
      ? `They're ${k(v.shortToday)} short the day it hits.`
      : v.survives
        ? `${k(Math.max(0, v.spare))} of savings left at the end.`
        : `That's ${v.monthsShort.toFixed(1)} months short. They'd need ${k(v.moneyNeeded)} more saved.`;

  return (
    <div className="space-y-8">
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
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRESETS.map((p) => {
            const active = JSON.stringify(p.shock) === JSON.stringify(shock);
            return (
              <button
                key={p.key}
                onClick={() => {
                  setShock(p.shock);
                  setHeard([]);
                }}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  active ? "border-accent bg-accent-soft shadow-sm" : "border-line bg-surface/70 hover:-translate-y-0.5 hover:border-accent/60"
                }`}
              >
                <p.Icon className={`size-5 ${active ? "text-accent-ink" : "text-ink-2"}`} aria-hidden />
                <div className="mt-2 text-sm font-semibold">{p.title}</div>
                <div className="text-xs text-muted">{p.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* result */}
      <div className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
        <div className="mx-auto">
          <RunwayRing runway={sc.runway} caption={has ? (v.survives ? "Makes it" : v.wipedOut ? "Wiped out" : "Runs out") : undefined} />
        </div>
        <div>
          {has && (
            <div className="text-sm font-medium text-accent-ink">
              {shockLabel(shock)} · was {months(base.runway)} months
            </div>
          )}
          <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h2>
          <p className="mt-3 text-lg text-ink-2">{sub}</p>
          {has && (
            <p className="mt-2 text-ink-2">
              Across all {all.length.toLocaleString()} customers, <b className="text-ink">{Math.round(share * 100)}%</b> wouldn&apos;t last {shock.durationMonths} months.
            </p>
          )}
          {has && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <NextButton onClick={onNext}>Make a plan</NextButton>
              {(shock.jobLoss || mode === "realistic") && (
                <button
                  onClick={() => setMode(mode === "judge" ? "realistic" : "judge")}
                  className="rounded-full border border-line px-4 py-2.5 text-sm text-ink-2 hover:border-accent hover:text-ink"
                  title="Realistic: EI capped at $729/week (2026) and pensions keep paying"
                >
                  {mode === "judge" ? "With the real EI cap" : "With the judges' formula"}: <b className="tnum text-ink">{months(other.runway)}</b> mo
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {has && (
        <div className="space-y-3">
          <Disclosure label="See the math">
            <MathBlock m={m} sc={sc} mode={mode} />
          </Disclosure>
          <Disclosure label="Adjust the shock by hand" icon={<SlidersHorizontal className="size-4" aria-hidden />}>
            <ShockSliders m={m} shock={shock} setShock={setShock} income={sc.income} />
          </Disclosure>
          <Disclosure label="See their savings month by month">
            <DepletionChart data={path} duration={shock.durationMonths} runway={sc.runway} hasShock withPlan={false} />
          </Disclosure>
        </div>
      )}
    </div>
  );
}

function ShockSliders({ m, shock, setShock, income }: { m: Metrics; shock: Shock; setShock: (s: Shock) => void; income: number }) {
  const set = (p: Partial<Shock>) => setShock({ ...shock, ...p });
  return (
    <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Toggle
          checked={shock.jobLoss}
          onChange={(on) => set(on ? { jobLoss: true, incomePct: shock.incomePct === 1 ? 0.55 : shock.incomePct } : { jobLoss: false, incomePct: 1 })}
          label="Job loss (income replaced by EI)"
        />
      </div>
      <Slider label={shock.jobLoss ? "EI pays" : "Income after shock"} value={shock.incomePct} min={0} max={1} step={0.05} onChange={(x) => set({ incomePct: x })} display={`${Math.round(shock.incomePct * 100)}% · ${money(income)}/mo`} />
      <Slider label="Bills / rent increase" value={shock.billsPct} min={0} max={0.5} step={0.01} onChange={(x) => set({ billsPct: x })} display={`+${Math.round(shock.billsPct * 100)}% · +${money(shock.billsPct * m.H)}/mo`} />
      <Slider label="Extra monthly cost" value={shock.extraMonthly} min={0} max={3000} step={50} onChange={(x) => set({ extraMonthly: x })} display={`+${money(shock.extraMonthly)}/mo`} />
      <Slider label="One-off cost (months of spending)" value={shock.oneOffMult} min={0} max={3} step={0.25} onChange={(x) => set({ oneOffMult: x })} display={`${shock.oneOffMult}× · ${money(shock.oneOffMult * m.S)}`} />
      <Slider label="One-off cost ($)" value={shock.oneOffAbs} min={0} max={20000} step={250} onChange={(x) => set({ oneOffAbs: x })} display={money(shock.oneOffAbs)} />
      <Slider label="How long it lasts" value={shock.durationMonths} min={1} max={24} step={1} onChange={(x) => set({ durationMonths: x })} display={`${shock.durationMonths} months`} />
    </div>
  );
}

function MathBlock({ m, sc, mode }: { m: Metrics; sc: Scenario; mode: Mode }) {
  const row = (key: string, formula: string, value: string, strong = false) => (
    <div className="grid grid-cols-[100px_1fr_auto] items-baseline gap-3 py-1.5">
      <span className="font-mono text-xs text-muted">{key}</span>
      <span className="font-mono text-xs text-ink-2">{formula}</span>
      <span className={`tnum text-right font-mono text-sm ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      {row("buffer_left", `B − one-off = ${money(m.B)} − ${money(sc.oneOff)}`, money(sc.bufferLeft))}
      {row("income", sc.incomeNote.replace(/\bI\b/, `I (${money(m.I)})`), money(sc.income))}
      {row("spending", sc.spendingNote.replace(/^S\b/, `S (${money(m.S)})`).replace(/\bH\b/, `H (${money(m.H)})`), money(sc.spending))}
      {row("gap", "spending − income", money(sc.gap))}
      <div className="my-1 border-t border-line" />
      {row(
        "runway",
        sc.bufferLeft <= 0 ? "buffer_left ≤ 0 → 0" : sc.gap <= 0 ? "gap ≤ 0 → no shortfall (120+)" : `min(${money(sc.bufferLeft)} ÷ ${money(sc.gap)}, 120)`,
        sc.runway === null ? "no shortfall (120+)" : `${formatRunway(sc.runway)} months`,
        true,
      )}
      <p className="mt-2 text-xs text-muted">
        {mode === "judge"
          ? "Judges' definitions, exactly as in the brief."
          : `Realistic: EI pays 55% of earnings up to $729/week (≈ ${money(EI_MONTHLY_CAP)}/mo, 2026), and pensions keep paying.`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ step 3 */

export function StepPlan({
  m,
  mode,
  shock,
  path,
  onRestart,
}: {
  m: Metrics;
  mode: Mode;
  shock: Shock;
  path: { month: number; balance: number; baseline: number; plan?: number }[];
  onRestart: () => void;
}) {
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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Two plans, built from their own numbers.</h2>
        <p className="mt-2 text-lg text-ink-2">One for the day it hits. One to be ready before it does.</p>
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
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${ok ? "bg-good-soft text-good-text" : "bg-critical-soft text-critical-text"}`}>
            {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
            {ok ? `Makes it through ${dur} months` : last.runway === 0 ? "Savings can't cover the bill" : `Still short of ${dur} months`}
          </div>
          <ol className="mt-5 space-y-2.5">
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
              {last.runway === 0 ? "Monthly cuts can't pay a bill due today. Spread the repair over a payment plan, and build the fund on the right." : "Cuts alone aren't enough. The real fix is the fund on the right."}
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
                  <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-ink-2">
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

      {has && (
        <Disclosure label="See how the backup plan stretches their savings">
          <DepletionChart data={path} duration={shock.durationMonths} runway={scenario(m, shock, mode).runway} hasShock withPlan />
        </Disclosure>
      )}

      <div className="text-center">
        <button onClick={onRestart} className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          Try another customer
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
