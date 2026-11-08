"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Droplets,
  Gauge,
  History,
  Landmark,
  Loader2,
  Minus,
  PiggyBank,
  Play,
  Repeat,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  TrendingUp,
  Wallet,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { BAND, bandOf, MILESTONES, NO_PULSE_CHANGES, surplusOf, type PulseChanges, type PulseHistory, type PulseProjection } from "@/lib/pulse";
import { CATEGORIES, CATEGORY_META, leverToReach, loanMonthsLeft, money, NO_CHANGES, project, type CategoryKey, type RankData, type RankRow } from "@/lib/rank";
import { AnimatedNumber, Segmented } from "../ui";
import { NumberField } from "../whatif/inputs";
import { TangerineFallback } from "./TangerineFallback";

type Now = { y: number; m: number };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (s: string | null) => {
  if (!s) return "";
  const [y, m] = s.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const signed = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(d)}`;
const r50 = (x: number) => Math.max(50, Math.round(x / 50) * 50);

/* ------------------------------------------------------------------ search */

export function AccountPulseSearch({
  ready,
  busy,
  error,
  onSubmit,
  examples,
  compact,
}: {
  ready: boolean;
  busy?: boolean;
  error?: string;
  onSubmit: (raw: string) => void;
  examples: { id: number; label: string }[];
  compact?: boolean;
}) {
  const [v, setV] = useState("");
  return (
    <div className={`pl-glass mx-auto max-w-2xl text-center ${compact ? "p-3" : "p-6"}`}>
      {!compact && <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Discover Your Tangerine Pulse</h2>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(v);
        }}
        className={`mx-auto flex max-w-lg flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-2/80 p-2 pl-4 focus-within:border-accent sm:flex-nowrap ${compact ? "" : "mt-4"}`}
      >
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <input
          inputMode="numeric"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
          placeholder={ready ? "Account ID, e.g. 20134" : "Loading account data…"}
          className="tnum min-w-0 flex-1 bg-transparent py-2 text-lg outline-none placeholder:text-muted"
          aria-label="Account ID"
          aria-invalid={!!error}
          aria-describedby={error ? "pulse-err" : undefined}
        />
        <button
          disabled={!ready || busy}
          className="wf-cta flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 font-semibold whitespace-nowrap text-white disabled:opacity-50 sm:w-auto"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          Bring My Tangerine to Life
        </button>
      </form>
      <AnimatePresence>
        {error && (
          <motion.p id="pulse-err" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-sm text-critical-text">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {!compact && ready && examples.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          {examples.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setV(String(x.id));
                onSubmit(String(x.id));
              }}
              className="rounded-full border border-line bg-surface-2/70 px-3 py-1.5 text-ink-2 hover:border-accent hover:text-ink"
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ score */

export function ResilienceScoreDisplay({ score, original, showing }: { score: number | null; original: number | null; showing: "projected" | "original" }) {
  if (score === null)
    return (
      <div className="text-center">
        <div className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Resilience score</div>
        <div className="mt-1 text-sm text-ink-2">Enter an account ID to fill your tangerine</div>
      </div>
    );
  const b = BAND[bandOf(score)];
  const diff = original !== null ? Math.round((score - original) * 10) / 10 : 0;
  return (
    <div className="text-center">
      <div className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">{showing === "original" ? "Original resilience" : "Resilience score"}</div>
      <div className="tnum flex items-baseline justify-center font-semibold tracking-tighter" style={{ textShadow: "0 0 30px rgba(255,128,0,.45)" }}>
        <span className="text-5xl sm:text-7xl">
          <AnimatedNumber value={score} format={(v) => v.toFixed(1)} />
        </span>
        <span className="ml-1 text-xl text-muted sm:text-2xl">/100</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${b.color}22`, color: b.color }}>
          {b.label}
        </span>
        <AnimatePresence>
          {showing === "projected" && Math.abs(diff) >= 0.1 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className={`tnum rounded-full px-2.5 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-good-soft text-good-text" : "bg-critical-soft text-critical-text"}`}
            >
              {signed(diff)} resilience points
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function MilestoneToast({ value }: { value: number | null }) {
  return (
    <AnimatePresence>
      {value !== null && (
        <motion.div
          key={value}
          role="status"
          initial={{ opacity: 0, y: -10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          className="pointer-events-none flex items-center gap-2.5 rounded-full border border-[#32D6A0]/50 bg-[#0b2a2a]/90 px-4 py-2 text-sm font-semibold text-[#6ee7c4] shadow-[0_0_40px_-8px_#32D6A0]"
        >
          <span className="relative grid size-5 place-items-center">
            <span className="pl-ring absolute inset-0 rounded-full border-2 border-[#32D6A0]" />
            <Droplets className="size-4" aria-hidden />
          </span>
          Milestone reached: {value}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ metric cards */

export interface Metric {
  key: CategoryKey;
  Icon: LucideIcon;
  title: string;
  value: string;
  sub: string;
  delta: number; // weighted points gained (+) or lost (−) under the hypothetical
  orig: string | null; // original value, when the projection differs
}

export function buildMetrics(row: RankRow, p: PulseProjection): Metric[] {
  const cov = (c: number) => (Number.isFinite(c) ? `${Math.max(0, c).toFixed(1)} months` : "12+ months");
  const flow = (i: number, s: number) => `${i - s >= 0 ? "+" : "−"}${money(Math.abs(i - s))}/mo`;
  const dti = (d: number, obl: number) => (obl > 0 ? `${(d * 100).toFixed(1)}% of income` : "No loan payments");
  const changed = (k: CategoryKey) => Math.abs(p.scored[k] - p.base[k]) >= 0.05;
  const d = Object.fromEntries(p.deltas.map((x) => [x.key, x.points])) as Record<CategoryKey, number>;
  return [
    {
      key: "buffer",
      Icon: PiggyBank,
      title: "Savings Buffer",
      value: cov(p.scored.coverage),
      sub: p.inputs.B >= 0 ? `${money(p.inputs.B)} saved vs ${money(p.inputs.S)}/mo spending` : `Overdrawn by ${money(-p.inputs.B)} at ${money(p.inputs.S)}/mo spending`,
      delta: d.buffer,
      orig: changed("buffer") || Math.abs(p.inputs.B - row.B) > 1 ? cov(p.base.coverage) : null,
    },
    {
      key: "cashflow",
      Icon: Waves,
      title: "Monthly Cash Flow",
      value: flow(p.inputs.I, p.inputs.S),
      sub: `${money(p.inputs.I)} in · ${money(p.inputs.S)} out`,
      delta: d.cashflow,
      orig: Math.abs(p.inputs.I - row.I) > 0.5 || Math.abs(p.inputs.S - row.S) > 0.5 ? flow(row.I, row.S) : null,
    },
    {
      key: "stability",
      Icon: Gauge,
      title: "Income Stability",
      value: `${p.scored.stability.toFixed(0)}/100`,
      sub: `Money in varies ${Math.round(row.cv * 100)}% month to month`,
      delta: d.stability,
      orig: null,
    },
    {
      key: "debt",
      Icon: Landmark,
      title: "Debt Burden",
      value: dti(p.scored.dti, p.inputs.obl),
      sub: p.inputs.obl > 0 ? `${money(p.inputs.obl)}/mo loan + leasing` : row.status === "A" ? "Loan on record fully repaid" : "None on record at this bank",
      delta: d.debt,
      orig: changed("debt") ? dti(p.base.dti, row.obl) : null,
    },
  ];
}

export function FinancialMetricCard({ m, side }: { m: Metric; side?: "left" | "right" }) {
  const up = m.delta > 0.05;
  const down = m.delta < -0.05;
  return (
    <div className="relative">
      {side && <div className={`absolute top-1/2 hidden w-8 lg:block ${side === "left" ? "-right-8 pl-connector" : "-left-8 pl-connector-r"}`} aria-hidden />}
      <div className="pl-glass p-3.5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-ink">
            <m.Icon className="size-4" aria-hidden />
          </span>
          <span className="text-xs font-medium text-ink-2">{m.title}</span>
        </div>
        <div className="tnum mt-2 text-lg leading-tight font-semibold">{m.value}</div>
        {m.orig && <div className="tnum text-[11px] text-muted line-through decoration-muted/60">{m.orig}</div>}
        <div className="mt-0.5 text-[11px] leading-snug text-muted">{m.sub}</div>
        {(up || down) && (
          <div className={`tnum mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${up ? "bg-good-soft text-good-text" : "bg-critical-soft text-critical-text"}`}>
            {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
            {signed(m.delta)} pts
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ simulator */

const HORIZONS = [3, 6, 12, 24];

export function GrowYourJuiceSimulator({
  row,
  now,
  changes,
  setChanges,
  p,
  onReset,
}: {
  row: RankRow;
  now: Now;
  changes: PulseChanges;
  setChanges: (c: PulseChanges) => void;
  p: PulseProjection;
  onReset: () => void;
}) {
  const surplus = surplusOf(row);
  const left = loanMonthsLeft(row, now);
  const set = (k: keyof PulseChanges, v: number) => setChanges({ ...changes, [k]: v });
  const dirty = changes.save || changes.spend || changes.income || changes.extraLoan;
  const why = explainChanges(row, p, changes);
  return (
    <section className="wf-card p-5 sm:p-6" aria-labelledby="grow-h">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="grow-h" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Droplets className="size-5 text-accent-ink" aria-hidden /> Grow Your Juice
          </h2>
          <p className="mt-1 text-sm text-ink-2">Explore how financial improvements could strengthen your resilience.</p>
        </div>
        <button onClick={onReset} disabled={!dirty} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-ink disabled:opacity-40">
          <RotateCcw className="size-4" aria-hidden /> Reset My Tangerine
        </button>
      </div>
      <div className="space-y-5">
        {surplus > 0 ? (
          <Lever Icon={PiggyBank} note={`Comes out of what you already have left over each month (${money(surplus)}), so it can’t exceed it.`}>
            <NumberField f={{ key: "pl-save", label: "Extra monthly savings", kind: "monthly", min: 0, max: r50(surplus), step: 25 }} value={changes.save} onChange={(v) => set("save", Math.min(v, Math.round(surplus)))} />
          </Lever>
        ) : (
          <p className="flex gap-2 rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-ink-2">
            <PiggyBank className="size-4 shrink-0 text-muted" aria-hidden />
            Your typical spending already matches or tops your income, so there’s no surplus to save from yet. Spending less or earning more frees some up.
          </p>
        )}
        <Lever Icon={Scissors} note="Negative = spend less (more juice); positive = spend more. The difference stays in, or leaves, your savings.">
          <NumberField
            f={{ key: "pl-spend", label: "Change in monthly spending", kind: "monthlySigned", min: -r50(row.S * 0.5), max: r50(row.S * 0.5), step: 25 }}
            value={changes.spend}
            onChange={(v) => set("spend", Math.max(-row.S, v))}
          />
        </Lever>
        <Lever Icon={TrendingUp} note="Changes income and cash flow; it doesn’t change how regular your income has been.">
          <NumberField
            f={{ key: "pl-income", label: "Additional monthly income", kind: "monthlySigned", min: -r50(row.I * 0.5), max: r50(row.I * 0.5), step: 50 }}
            value={changes.income}
            onChange={(v) => set("income", Math.max(-row.I, v))}
          />
        </Lever>
        {row.P > 0 && left > 0 ? (
          <Lever Icon={Wallet} note={`${left} payments of ${money(row.P)} left on your loan. Clearing it early ends that payment.`}>
            <NumberField f={{ key: "pl-loan", label: "Additional loan repayment", kind: "monthly", min: 0, max: r50(Math.max(500, row.P * 3)), step: 25 }} value={changes.extraLoan} onChange={(v) => set("extraLoan", v)} />
          </Lever>
        ) : (
          <p className="flex gap-2 rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted">
            <Wallet className="size-4 shrink-0" aria-hidden />
            {row.P > 0 ? "Your loan’s schedule has already ended, so there’s nothing extra to repay." : "No running loan on record, so extra loan repayments don’t apply."}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm text-ink-2">
            <Calendar className="size-4" aria-hidden /> Simulation duration
          </span>
          <Segmented<string> size="sm" value={String(changes.months)} onChange={(v) => set("months", Number(v))} options={HORIZONS.map((h) => ({ value: String(h), label: `${h} months` }))} />
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-surface-2/60 p-4" aria-live="polite">
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">What’s changing your juice</div>
        {why.length ? (
          <ul className="space-y-1.5 text-sm">
            {why.map((w) => (
              <li key={w.key} className="flex gap-2">
                <span className={`tnum w-14 shrink-0 text-right font-semibold ${w.points > 0.05 ? "text-good-text" : w.points < -0.05 ? "text-critical-text" : "text-muted"}`}>
                  {Math.abs(w.points) < 0.05 ? "0.0" : signed(w.points)}
                </span>
                <span className="text-ink-2">
                  <span className="font-medium text-ink">{CATEGORY_META[w.key].name}:</span> {w.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">Move a slider to see how your score is recalculated. Nothing is added by hand: every change runs through the same scoring rules as the Rank page.</p>
        )}
        {p.notes.length > 0 && <p className="mt-2 text-xs text-muted">{p.notes.join(". ")}.</p>}
      </div>
    </section>
  );
}

function Lever({ Icon, note, children }: { Icon: LucideIcon; note: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {children}
        <div className="mt-1 text-[11px] text-muted">{note}</div>
      </div>
    </div>
  );
}

function explainChanges(row: RankRow, p: PulseProjection, ch: PulseChanges): { key: CategoryKey; points: number; text: string }[] {
  if (!(ch.save || ch.spend || ch.income || ch.extraLoan)) return [];
  const T = ch.months;
  const cov = (c: number) => (Number.isFinite(c) ? `${Math.max(0, c).toFixed(1)}` : "12+");
  const texts: Record<CategoryKey, string> = {
    buffer: `savings go from ${money(row.B)} to ${money(p.inputs.B)} over ${T} months, covering ${cov(p.scored.coverage)} months of spending instead of ${cov(p.base.coverage)}.`,
    cashflow: `monthly ${p.inputs.I - p.inputs.S >= 0 ? "surplus" : "shortfall"} moves from ${money(row.I - row.S)} to ${money(p.inputs.I - p.inputs.S)}.`,
    stability: "unchanged. These actions don’t change how regular your past income has been.",
    debt:
      p.paidOffAt !== null
        ? `your loan is cleared in month ${p.paidOffAt}, so its ${money(row.P)}/mo payment ends.`
        : Math.abs(p.scored.dti - p.base.dti) > 1e-4
          ? `payments take ${(p.scored.dti * 100).toFixed(1)}% of income instead of ${(p.base.dti * 100).toFixed(1)}%.`
          : "unchanged.",
  };
  return [...p.deltas].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).map((d) => ({ ...d, text: texts[d.key] }));
}

/* ------------------------------------------------------------------ comparison */

export function JuiceComparison({
  original,
  projected,
  showing,
  setShowing,
}: {
  original: number;
  projected: number;
  showing: "projected" | "original";
  setShowing: (s: "projected" | "original") => void;
}) {
  const diff = Math.round((projected - original) * 10) / 10;
  return (
    <section className="wf-card p-5" aria-labelledby="cmp-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="cmp-h" className="text-lg font-semibold tracking-tight">
          Compare My Juice
        </h2>
        <Segmented<"projected" | "original">
          size="sm"
          value={showing}
          onChange={setShowing}
          options={[
            { value: "projected", label: "Show projected" },
            { value: "original", label: "Show original" },
          ]}
        />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {[
          { k: "original" as const, label: "Original", v: original },
          null,
          { k: "projected" as const, label: "Projected", v: projected },
        ].map((x, i) =>
          x === null ? (
            <div key={i} className="flex flex-col items-center gap-1 text-center">
              <ArrowRight className="size-5 text-muted" aria-hidden />
              <span className={`tnum text-sm font-semibold ${diff > 0 ? "text-good-text" : diff < 0 ? "text-critical-text" : "text-muted"}`}>
                {Math.abs(diff) < 0.1 ? "no change" : `${signed(diff)} pts`}
              </span>
            </div>
          ) : (
            <button
              key={x.k}
              onClick={() => setShowing(x.k)}
              aria-pressed={showing === x.k}
              className={`flex flex-col items-center rounded-2xl p-2 transition-colors ${showing === x.k ? "bg-accent-soft ring-1 ring-accent/60" : "hover:bg-surface-2/60"}`}
            >
              <TangerineFallback score={x.v} size={92} label={`${x.label}: ${x.v.toFixed(1)} out of 100`} />
              <span className="text-xs text-ink-2">{x.label}</span>
              <span className="tnum text-xl font-semibold">{x.v.toFixed(1)}</span>
            </button>
          ),
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted">The 3D tangerine shows whichever one is selected.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ breakdown */

export function ResilienceBreakdown({ data, row, p }: { data: RankData; row: RankRow; p: PulseProjection }) {
  return (
    <section aria-labelledby="fuel-h">
      <h2 id="fuel-h" className="mb-1 text-xl font-semibold tracking-tight">
        What’s Fueling Your Tangerine?
      </h2>
      <p className="mb-4 text-sm text-ink-2">Your juice level is the sum of four parts. Each scores 0–100 and is weighted into the total.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {CATEGORIES.map((c, i) => {
          const w = data.meta.weights[c];
          const now = p.base[c];
          const next = p.scored[c];
          const d = next - now;
          return (
            <motion.div
              key={c}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="wf-card p-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold">{CATEGORY_META[c].name}</span>
                <span className="text-xs text-muted">weight {Math.round(w * 100)}%</span>
                <span className="tnum ml-auto text-xl font-semibold">
                  {next.toFixed(0)}
                  <span className="text-sm text-muted">/100</span>
                </span>
              </div>
              {/* segmented bar: 10 segments, filled by the projected score; outline marks the original */}
              <div className="mt-2.5 grid grid-cols-10 gap-1" aria-hidden>
                {Array.from({ length: 10 }, (_, k) => {
                  const fillNext = Math.min(1, Math.max(0, next / 10 - k));
                  const fillNow = Math.min(1, Math.max(0, now / 10 - k));
                  return (
                    <div key={k} className="relative h-2.5 overflow-hidden rounded-sm bg-surface-2">
                      <motion.div className="absolute inset-y-0 left-0" style={{ background: "linear-gradient(90deg, #FF8000, #FFB347)" }} animate={{ width: `${fillNext * 100}%` }} transition={{ duration: 0.6 }} />
                      {fillNow > 0 && fillNow < 1 && Math.abs(d) >= 0.05 && <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: `${fillNow * 100}%` }} />}
                    </div>
                  );
                })}
              </div>
              <div className="tnum mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-muted">
                <span>
                  Contributes {(w * next).toFixed(1)} of {Math.round(w * 100)} pts
                </span>
                {Math.abs(d) >= 0.05 ? (
                  <span className={`inline-flex items-center gap-1 font-semibold ${d > 0 ? "text-good-text" : "text-critical-text"}`}>
                    {d > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                    {d > 0 ? "Improved" : "Weakened"} {signed(w * d)} pts
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Minus className="size-3.5" aria-hidden /> No change
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{CATEGORY_META[c].how(row, p.base)}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ recommendations */

interface Rec {
  title: string;
  detail: string;
  Icon: LucideIcon;
  apply: PulseChanges | null;
}

export function PulseRecommendations({ data, row, hist, now, onTry }: { data: RankData; row: RankRow; hist: PulseHistory | undefined; now: Now; onTry: (c: PulseChanges) => void }) {
  const recs = useMemo<Rec[]>(() => {
    const out: Rec[] = [];
    const T = 12;
    const target = MILESTONES.find((m) => m > row.score) ?? null;
    const surplus = surplusOf(row);
    const cats = [...CATEGORIES].sort((a, b) => data.meta.weights[b] * (100 - row[b]) - data.meta.weights[a] * (100 - row[a]));
    const tried = new Set<string>();
    for (const c of cats) {
      if (out.length >= 2) break;
      if ((c === "buffer" || c === "stability") && !tried.has("buffer")) {
        tried.add("buffer");
        if (surplus >= 25) out.push(lever(data, row, now, "save", surplus, target, T, c));
        else if (!tried.has("cut")) {
          // no surplus to save from: spending less is what builds the buffer
          tried.add("cut");
          out.push(lever(data, row, now, "cut", r50(row.S * 0.3), target, T, c));
        }
      } else if (c === "cashflow" && !tried.has("cut")) {
        tried.add("cut");
        out.push(lever(data, row, now, "cut", r50(row.S * 0.3), target, T, c));
      } else if (c === "debt" && !tried.has("loan") && row.P > 0 && loanMonthsLeft(row, now) > 0) {
        tried.add("loan");
        out.push(lever(data, row, now, "extraLoan", r50(row.P * 3), target, T, c));
      }
    }
    // from the account's own history (transactions.csv / monthly_summary.csv)
    if (hist && (hist.negMonths > 0 || hist.penCount > 0)) {
      out.push({
        Icon: AlertTriangle,
        title: `Cushion the dips below zero`,
        detail: `In the last 12 months your balance ended a day below zero in ${hist.negMonths} month${hist.negMonths === 1 ? "" : "s"}${
          hist.penCount ? ` and you paid ${money(hist.penTotal)} in penalty interest (${hist.penCount} charge${hist.penCount === 1 ? "" : "s"})` : ""
        }. Keeping one month of fixed costs (${money(hist.F)}) untouched would cover a dip like that.`,
        apply: null,
      });
    } else if (row.debt < 70 && row.obl > 0) {
      out.push({
        Icon: Landmark,
        title: "Keep loan payments manageable",
        detail: `Loan and leasing payments take ${((row.obl / row.I) * 100).toFixed(1)}% of your typical income. Avoiding new borrowing until that falls keeps this part of your score from slipping.`,
        apply: null,
      });
    }
    return out.slice(0, 3);
  }, [data, row, hist, now]);

  return (
    <section aria-labelledby="rec-h">
      <h2 id="rec-h" className="mb-1 text-xl font-semibold tracking-tight">
        How to Keep Your Tangerine Growing
      </h2>
      <p className="mb-4 text-sm text-ink-2">Based on your weakest parts and your account history. Each amount was tested against the scoring model.</p>
      <div className={`grid gap-4 ${recs.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {recs.map((r) => (
          <motion.div key={r.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="wf-card flex flex-col p-4">
            <span className="mb-2 grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-ink">
              <r.Icon className="size-5" aria-hidden />
            </span>
            <div className="font-semibold">{r.title}</div>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-2">{r.detail}</p>
            {r.apply && (
              <button onClick={() => onTry(r.apply!)} className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-2 hover:border-accent hover:text-ink">
                <Play className="size-3.5" aria-hidden /> Try it on my tangerine
              </button>
            )}
          </motion.div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">These show what the scoring model would say, not what you can afford. Only you know your full budget.</p>
    </section>
  );
}

function lever(data: RankData, row: RankRow, now: Now, which: "save" | "cut" | "extraLoan", max: number, target: number | null, T: number, cat: CategoryKey): Rec {
  const verb = { save: "Set aside", cut: "Spend", extraLoan: "Pay an extra" }[which];
  const tail = { save: "/mo", cut: "/mo less", extraLoan: "/mo on your loan" }[which];
  const Icon = { save: PiggyBank, cut: Scissors, extraLoan: Wallet }[which];
  const toPulse = (v: number): PulseChanges => ({ ...NO_PULSE_CHANGES, months: T, save: which === "save" ? v : 0, spend: which === "cut" ? -v : 0, extraLoan: which === "extraLoan" ? v : 0 });
  const scoreAt = (v: number) => project(data, row, { ...NO_CHANGES, months: T, [which]: v }, now).score;
  if (target !== null) {
    const v = leverToReach(data, row, which, target, T, max, now);
    if (v !== null && v > 0)
      return {
        Icon,
        title: `${verb} ${money(v)}${tail}`,
        detail: `Strengthens your ${CATEGORY_META[cat].name.toLowerCase()}. Kept up for ${T} months, it takes your score from ${row.score.toFixed(1)} to ${scoreAt(v).toFixed(1)}, past the ${target} milestone.`,
        apply: toPulse(v),
      };
  }
  // can't reach the next milestone with this alone: show what a moderate amount does
  const v = Math.min(max, which === "save" ? Math.round(max / 2 / 25) * 25 || max : r50(max / 2));
  return {
    Icon,
    title: `${verb} ${money(v)}${tail}`,
    detail: `Strengthens your ${CATEGORY_META[cat].name.toLowerCase()}. Over ${T} months it moves your score from ${row.score.toFixed(1)} to ${scoreAt(v).toFixed(1)}${
      target !== null ? `; reaching ${target} would take more than one change` : ""
    }.`,
    apply: toPulse(v),
  };
}

/* ------------------------------------------------------------------ history */

export function AccountHistory({ hist, asOf }: { hist: PulseHistory | undefined; asOf: string }) {
  if (!hist) return null;
  const pct = (x: number | null) => (x === null ? "n/a" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(0)}%`);
  const so = [
    ["household bills", hist.soBills],
    ["insurance", hist.soIns],
    ["leasing", hist.soLease],
    ["loan", hist.soLoan],
    ["other", hist.soOther],
  ].filter(([, v]) => (v as number) > 0) as [string, number][];
  const items: { Icon: LucideIcon; title: string; text: string }[] = [
    {
      Icon: TrendingUp,
      title: "Recent trend",
      text: `Comparing the last 6 months with the 6 before: money in ${pct(hist.trendIn)}, money out ${pct(hist.trendOut)}.`,
    },
    {
      Icon: AlertTriangle,
      title: "Below zero",
      text: hist.negMonths
        ? `${hist.negMonths} of 12 months ended at least one day below zero; lowest balance ${money(hist.lowBal ?? 0)}.`
        : `No days below zero. Lowest end-of-day balance: ${money(hist.lowBal ?? 0)}.`,
    },
    {
      Icon: History,
      title: "Big payments",
      text: hist.bigCount
        ? `${hist.bigCount} single payment${hist.bigCount === 1 ? "" : "s"} bigger than a typical month’s spending; the largest was ${money(hist.bigAmt ?? 0)} (${hist.bigOp}${
            hist.bigPurpose ? `, ${hist.bigPurpose}` : ""
          }) in ${ym(hist.bigMonth)}.`
        : "No single payment bigger than a typical month’s spending.",
    },
    {
      Icon: Repeat,
      title: "Recurring commitments",
      text: hist.soCount
        ? `${hist.soCount} standing order${hist.soCount === 1 ? "" : "s"} totalling ${money(hist.soTotal)}/mo (${so.map(([k, v]) => `${k} ${money(v)}`).join(", ")}).`
        : "No standing orders on record.",
    },
  ];
  return (
    <section aria-labelledby="hist-h">
      <h2 id="hist-h" className="mb-1 text-xl font-semibold tracking-tight">
        From your account history
      </h2>
      <p className="mb-4 text-sm text-ink-2">
        {ym(hist.from)} to {ym(hist.to)}, from the bank’s records (monthly summaries, transactions and standing orders). Historical data up to {ym(asOf)}, not live banking.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <div key={it.title} className="wf-card p-4">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <it.Icon className="size-4 text-accent-ink" aria-hidden /> {it.title}
            </div>
            <p className="text-sm leading-relaxed text-ink-2">{it.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
