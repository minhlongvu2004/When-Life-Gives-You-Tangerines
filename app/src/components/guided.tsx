"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  CloudLightning,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatRunway, money, NO_SHOCK, pct, scenario, verdict, type Metrics, type Mode, type Shock } from "@/lib/engine";
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
  good: { ring: "var(--good)", text: "text-good-text", soft: "bg-good-soft", Icon: CheckCircle2, word: "6+ months" },
  warning: { ring: "var(--warning)", text: "text-ink", soft: "bg-warning-soft", Icon: ShieldCheck, word: "3–6 months" },
  critical: { ring: "var(--critical)", text: "text-critical-text", soft: "bg-critical-soft", Icon: XCircle, word: "Under 3 months" },
};

export const PRESETS: { key: string; title: string; sub: string; Icon: LucideIcon; shock: Shock }[] = [
  { key: "job", title: "Job loss", sub: "EI estimate: 55% of income for 6 months", Icon: Briefcase, shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 } },
  { key: "cut", title: "Pay cut or fewer hours", sub: "Income down 30% for 6 months", Icon: TrendingDown, shock: { ...NO_SHOCK, incomePct: 0.7, durationMonths: 6 } },
  {
    key: "costs",
    title: "Higher bills",
    sub: "Rent/bills +15% and $200 more a month for 12 months",
    Icon: TrendingUp,
    shock: { ...NO_SHOCK, billsPct: 0.15, extraMonthly: 200, durationMonths: 12 },
  },
  { key: "expense", title: "Surprise expense", sub: "One-time cost of 2 months of spending (like a car repair)", Icon: Receipt, shock: { ...NO_SHOCK, oneOffMult: 2, durationMonths: 6 } },
  {
    key: "storm",
    title: "Job loss + higher bills",
    sub: "EI estimate 55% and bills +15% for 6 months",
    Icon: CloudLightning,
    shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, billsPct: 0.15, durationMonths: 6 },
  },
];

export function shockLabel(s: Shock): string {
  const parts: string[] = [];
  if (s.jobLoss) parts.push(`job loss (EI estimate ${pct(s.incomePct)})`);
  else if (s.incomePct !== 1) parts.push(`income down ${pct(1 - s.incomePct)}`);
  if (s.billsPct) parts.push(`rent/bills +${pct(s.billsPct)}`);
  if (s.extraMonthly) parts.push(`+${money(s.extraMonthly)}/month other costs`);
  if (s.oneOffMult) parts.push(`one-time cost: ${s.oneOffMult === 1 ? "1 month" : s.oneOffMult + " months"} of spending`);
  if (s.oneOffAbs) parts.push(`one-time ${money(s.oneOffAbs)}`);
  const out = parts.join(" + ");
  return out ? out[0].toUpperCase() + out.slice(1) : "";
}
export const isShock = (s: Shock) => shockLabel(s) !== "";

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
            {label ?? (runway === null ? "no monthly shortfall" : "months your money lasts")}
          </div>
          <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.soft} ${t.text}`}>
            <t.Icon className="size-3.5" aria-hidden /> {caption ?? t.word}
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs whitespace-nowrap text-muted">Full circle = {GOAL_MONTHS} months covered</div>
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
      ? "Already out of money in the account."
      : base.runway === null
        ? surplus > 0
          ? bufMonths < 3
            ? `Saving ${k(surplus)} a month, on a thin cushion.`
            : `Saving ${k(surplus)} a month.`
          : "Breaking even every month."
        : `Spending ${k(base.gap)} more than comes in, every month.`;
  const story =
    base.runway === null
      ? `Their account balance would cover ${bufMonths.toFixed(1)} months of normal spending if money stopped coming in.`
      : `At this pace their ${k(m.B)} account balance lasts ${months(base.runway)} months.`;

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
          <div className="text-sm font-medium text-accent-ink">Today, with no changes</div>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h2>
          <p className="mt-3 text-lg text-ink-2">{story}</p>
          {peers && (
            <p className="mt-2 text-ink-2">
              People with similar income keep <b className="text-ink">{peers.fifthMedianBufferMonths.toFixed(1)} months</b> of spending saved.
            </p>
          )}
          <div className="mt-5 grid grid-cols-3 gap-4 rounded-2xl border border-line bg-surface/70 px-4 py-4 sm:grid-cols-5">
            <Kpi label="Money in" value={k(m.I)} sub="per month" />
            <Kpi label="Fixed costs" value={k(m.F)} sub={`bills ${k(m.H)} · loan ${k(m.P)}`} />
            <Kpi label="Money out" value={k(m.S)} sub="per month" />
            <Kpi label="Balance" value={k(m.B)} sub="account, 6-mo avg" />
            <Kpi
              label="Money lasts"
              value={base.runway === null ? "120+" : `${months(base.runway)} mo`}
              sub={base.runway === null ? "no monthly shortfall" : "at this pace"}
            />
          </div>
          <div className="mt-5">
            <NextButton onClick={onNext}>Try a what-if</NextButton>
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
    setHeard(p.understood.length ? p.understood : ["Couldn't read that. Pick an example below or use the sliders."]);
    if (p.understood.length) setShock(p.shock);
  };

  const headline = !has
    ? "What would happen to them?"
    : v.wipedOut
      ? "The one-time costs are more than the account balance."
      : v.survives
        ? `The account covers all ${shock.durationMonths} months.`
        : `The account runs out in month ${Math.max(1, Math.ceil(sc.runway ?? 0))} of ${shock.durationMonths}.`;
  const sub = !has
    ? "Describe it, pick an example, or move the sliders."
    : v.wipedOut
      ? `That's ${k(v.shortToday)} more than the account holds.`
      : v.survives
        ? `About ${k(Math.max(0, v.spare))} left in the account at the end.`
        : `${v.monthsShort.toFixed(1)} months short. About ${k(v.moneyNeeded)} more in the account would cover it.`;

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
            placeholder="Describe it in your own words, e.g. “I lose my job (EI at 55%) and rent goes up $200 a month”"
            className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted"
            aria-label="Describe a what-if"
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
          <div className="mb-3 text-sm font-semibold">Set up the what-if</div>
          <ShockSliders m={m} shock={shock} setShock={setShock} income={sc.income} />
        </div>

        <div
          className={`flex flex-col justify-center rounded-3xl border bg-surface p-6 shadow-sm ${has ? "border-accent/40 ring-4 ring-accent-soft" : "border-line"}`}
        >
          <div className="flex items-center gap-6">
            <RunwayRing runway={sc.runway} size={170} caption={has ? (v.survives ? "Covers it" : v.wipedOut ? "Can't cover" : "Runs short") : undefined} />
            <div className="min-w-0">
              {has && (
                <div className="text-sm font-medium text-accent-ink">
                  {shockLabel(shock)} · was {months(base.runway)} months
                </div>
              )}
              <h2 className="mt-1 text-3xl leading-tight font-semibold tracking-tight">{headline}</h2>
              <p className="mt-2 text-ink-2">{sub}</p>
            </div>
          </div>
          {has && (
            <>
              <div className="mt-5 rounded-xl bg-surface-2 px-4 py-2.5 font-mono text-sm text-ink-2" title="Months = balance left after one-time costs ÷ (monthly spending − monthly money in)">
                {sc.bufferLeft <= 0
                  ? `${k(m.B)} balance − ${k(sc.oneOff)} one-time costs ≤ 0  →  0 months`
                  : sc.gap <= 0
                    ? `money in ${k(sc.income)} ≥ spending ${k(sc.spending)}  →  no monthly shortfall`
                    : `${k(sc.bufferLeft)} left ÷ ${k(sc.gap)} monthly shortfall  =  ${months(sc.runway)} months`}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
                <span>
                  <b className="text-ink">{Math.round(share * 100)}%</b> of the {all.length.toLocaleString()} customers in this data wouldn&apos;t be covered for{" "}
                  {shock.durationMonths} months
                </span>
                {(shock.jobLoss || mode === "realistic") && (
                  <button
                    onClick={() => setMode(mode === "judge" ? "realistic" : "judge")}
                    className="underline decoration-dotted underline-offset-4 hover:text-ink"
                    title="Realistic: caps EI at $729/week (2026) and keeps pension income coming in"
                  >
                    {mode === "judge" ? "With the EI weekly maximum" : "With the simple formula (no EI maximum)"}: <b className="tnum text-ink">{months(other.runway)} months</b>
                  </button>
                )}
              </div>
              <div className="mt-5">
                <NextButton onClick={onNext}>Recovery Plan</NextButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Round up to a tidy slider maximum (at least one step). */
const niceMax = (x: number, step: number) => Math.max(step, Math.ceil(x / step) * step);

function ShockSliders({ m, shock, setShock, income }: { m: Metrics; shock: Shock; setShock: (s: Shock) => void; income: number }) {
  const set = (p: Partial<Shock>) => setShock({ ...shock, ...p });
  // Income is entered in dollars per month (usual income × rate) so any exact amount can be typed.
  // Customers with no recorded income fall back to a percentage.
  const dollars = m.I >= 1;
  const entered = shock.incomePct * m.I;
  const lostPct = 1 - shock.incomePct;
  const lostNote = lostPct > 0.0005 ? `−${pct(lostPct)}${dollars ? ` (−${money(lostPct * m.I)})` : ""}` : "no change";
  const countsAs = Math.abs(income - entered) > 1 ? ` Counts as ${money(income)}/mo after the EI weekly maximum and pension income.` : "";
  return (
    <div className="grid grid-cols-1 gap-y-2">
      <div className="flex items-center gap-3">
        <Toggle
          checked={shock.jobLoss}
          onChange={(on) => set(on ? { jobLoss: true, incomePct: shock.incomePct === 1 ? 0.55 : shock.incomePct } : { jobLoss: false, incomePct: 1 })}
          label="Job loss (estimated EI)"
        />
        {shock.jobLoss && <span className="text-xs text-muted">Estimate only · EI max $729/week</span>}
      </div>
      <Slider
        label={shock.jobLoss ? "Income during job loss" : "Income still coming in"}
        value={dollars ? entered : shock.incomePct}
        min={0}
        max={dollars ? Math.ceil(m.I) : 1}
        step={dollars ? 1 : 0.001}
        onChange={(x) => set({ incomePct: dollars ? x / m.I : x })}
        field={dollars ? { prefix: "$", suffix: "/mo" } : { scale: 100, decimals: 1, suffix: "%" }}
        display={lostNote}
        displayTitle={`${lostNote}.${countsAs}`}
      />
      {m.H >= 1 && (
        <Slider
          label="Rent/bills go up by"
          value={shock.billsPct * m.H}
          min={0}
          max={Math.max(500, niceMax(m.H, 100))}
          step={1}
          curve={2}
          onChange={(x) => set({ billsPct: x / m.H })}
          field={{ prefix: "+$", suffix: "/mo" }}
          openEnded
          hardMax={1_000_000}
          display={`+${pct(shock.billsPct)} of usual bills`}
        />
      )}
      <Slider
        label="New monthly cost"
        value={shock.extraMonthly}
        min={0}
        max={Math.max(500, niceMax(0.25 * m.S, 250))}
        step={1}
        onChange={(x) => set({ extraMonthly: x })}
        field={{ prefix: "+$", suffix: "/mo" }}
        openEnded
        hardMax={1_000_000}
      />
      <Slider
        label="One-time cost (× spending)"
        value={shock.oneOffMult}
        min={0}
        max={3}
        step={0.01}
        onChange={(x) => set({ oneOffMult: x })}
        field={{ decimals: 2, suffix: "×" }}
        openEnded
        hardMax={36}
        display={`= ${money(shock.oneOffMult * m.S)}`}
      />
      <Slider
        label="Plus a one-time amount"
        value={shock.oneOffAbs}
        min={0}
        max={Math.max(5000, niceMax(m.S, 1000))}
        step={1}
        onChange={(x) => set({ oneOffAbs: x })}
        field={{ prefix: "$" }}
        openEnded
        hardMax={10_000_000}
      />
      <Slider
        label="How long this lasts"
        value={shock.durationMonths}
        min={1}
        max={24}
        step={1}
        onChange={(x) => set({ durationMonths: x })}
        field={{ suffix: "months" }}
      />
    </div>
  );
}

