"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronDown, ShieldCheck, SlidersHorizontal, Sparkles, XCircle } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { backupPlan, formatRunway, NO_SHOCK, scenario, verdict, type Metrics, type Mode, type Shock } from "@/lib/engine";
import { isShock, shockLabel } from "@/lib/shocks";
import { parseTwist } from "@/lib/twist";
import type { MonthRow } from "@/lib/data";
import type { ProvKey } from "@/lib/provenance";
import type { YM } from "@/lib/whatif/scenarios";
import { BalanceChart, InOutChart } from "./charts";
import { ProvTip } from "./ProvTip";
import { CustomShocks } from "./shock/CustomShocks";
import { ShockControls } from "./shock/ShockFields";
import { ImpactChart, ImpactTiles, impactStory, useProjection } from "./shock/ShockImpact";
import { ShockLibrary } from "./shock/ShockLibrary";
import { TabBar } from "./ui";

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

export { shockLabel };

/* ------------------------------------------------------------------ primitives */

/** Ring = progress toward a 6-month safety cushion (the length of a typical EI claim). */
export function RunwayRing({
  runway,
  size = 200,
  caption,
  label,
  compact,
}: {
  runway: number | null; // months; null = no shortfall (120+)
  size?: number;
  caption?: string;
  label?: string;
  compact?: boolean;
}) {
  const tone = toneOf(runway);
  const t = TONE[tone];
  const stroke = size < 160 ? 10 : 14;
  const numCls = size < 130 ? "text-3xl" : size < 160 ? "text-4xl" : size < 200 ? "text-5xl" : "text-6xl";
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = runway === null ? 1 : Math.min(Math.max(runway, 0), GOAL_MONTHS) / GOAL_MONTHS;
  return (
    <div className="flex shrink-0 flex-col items-center" title={compact ? `Full circle = ${GOAL_MONTHS} months covered` : undefined}>
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
          <div className={`mt-0.5 max-w-[72%] leading-tight text-ink-2 ${size < 130 ? "text-[10px]" : size < 160 ? "text-xs" : "text-sm"}`}>
            {label ?? (runway === null ? "no monthly shortfall" : "months your money lasts")}
          </div>
          <div className={`inline-flex items-center gap-1 rounded-full font-semibold ${size < 130 ? "mt-1 px-2 py-px text-[10px]" : "mt-2 px-2.5 py-0.5 text-xs"} ${t.soft} ${t.text}`}>
            <t.Icon className={size < 130 ? "size-3" : "size-3.5"} aria-hidden /> {caption ?? t.word}
          </div>
        </div>
      </div>
      {!compact && <div className="mt-2 text-xs whitespace-nowrap text-muted">Full circle = {GOAL_MONTHS} months covered</div>}
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

export { SheetButton } from "./Sheet";

function Kpi({ label, value, sub, prov }: { label: string; value: string; sub?: string; prov?: ProvKey }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-xs font-medium tracking-wide text-muted uppercase">
        {label}
        {prov && <ProvTip k={prov} />}
      </div>
      <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function NextButton({ onClick, children, small }: { onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`btn btn-primary group gap-2 rounded-full text-sm ${small ? "px-4 py-1.5" : "px-6 py-3"}`}
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
  historyMissing,
}: {
  m: Metrics;
  rows: MonthRow[];
  peers: Peers | null;
  mode: Mode;
  onNext: () => void;
  historyMissing?: boolean;
}) {
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
    m.S <= 0
      ? "This account records no regular spending, so months of savings can't be calculated."
      : base.runway === null
        ? `Their account balance would cover ${bufMonths.toFixed(1)} months of normal spending if money stopped coming in.`
        : `At this pace their ${k(m.B)} account balance lasts ${months(base.runway)} months.`;
  const first = rows[0]?.month;
  const last = rows[rows.length - 1]?.month;

  return (
    <div className="space-y-4">
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="mx-auto">
          {m.S > 0 ? (
            <RunwayRing
              runway={Math.round(bufMonths * 10) / 10}
              size={180}
              label="months of spending saved"
              caption={bufMonths >= 6 ? "Well cushioned" : bufMonths >= 3 ? "Thin cushion" : "Very thin cushion"}
            />
          ) : (
            <div className="grid size-[180px] place-items-center rounded-full border-[14px] border-grid text-center text-sm text-ink-2">Unable to calculate</div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-accent-ink">
            Latest data (to Dec 2025), no changes <ProvTip k="bufferMonths" />
          </div>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h2>
          <p className="mt-3 text-lg text-ink-2">{story}</p>
          {peers && m.S > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-ink-2">
              <span>
                People with similar income keep <b className="text-ink">{peers.fifthMedianBufferMonths.toFixed(1)} months</b> of spending saved ({peers.fifth} fifth of income).
              </span>
              <ProvTip k="peers" />
            </p>
          )}
          <div className="mt-5 grid grid-cols-3 gap-4 rounded-2xl border border-line bg-surface/70 px-4 py-4 sm:grid-cols-5">
            <Kpi label="Money in" value={k(m.I)} sub="typical month" prov="I" />
            <Kpi label="Fixed costs" value={k(m.F)} sub={`bills ${k(m.H)} · loan ${m.P > 0 ? k(m.P) : "none"}`} prov="F" />
            <Kpi label="Money out" value={k(m.S)} sub="typical month" prov="S" />
            <Kpi label="Balance" value={k(m.B)} sub="account, 6-mo avg" prov="B" />
            <Kpi
              label="Money lasts"
              value={base.runway === null ? "120+" : `${months(base.runway)} mo`}
              sub={base.runway === null ? "no monthly shortfall" : "at this pace"}
              prov="runway"
            />
          </div>
          <div className="mt-5">
            <NextButton onClick={onNext}>Try a what-if</NextButton>
          </div>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <InOutChart rows={rows} />
            <BalanceChart rows={rows} buffer={m.B} />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            Recorded history, {first} to {last} ({rows.length} months), monthly_summary.csv. Historical data, not live balances.
            <ProvTip k="history" />
          </div>
        </div>
      ) : historyMissing ? (
        <div className="grid h-56 place-items-center rounded-3xl border border-dashed border-line bg-surface text-sm text-ink-2">Monthly history unavailable for this account.</div>
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
  const [left, setLeft] = useState<"presets" | "custom" | "adjust">("presets");
  const [right, setRight] = useState<"chart" | "plan" | "explain">("chart");
  const base = scenario(m, NO_SHOCK, mode);
  const sc = scenario(m, shock, mode);
  const other = scenario(m, shock, mode === "judge" ? "realistic" : "judge");
  const v = verdict(sc, shock.durationMonths);
  const has = isShock(shock);
  const steps = useMemo(() => (has ? backupPlan(m, shock, mode) : []), [m, shock, mode, has]);
  const { p } = useProjection(m, shock, mode, start);

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
    setHeard(p.understood.length ? p.understood : ["Couldn't read that. Pick an example or set the values yourself."]);
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
    ? "Describe it, pick an example, or set the values yourself."
    : v.wipedOut
      ? `That's ${k(v.shortToday)} more than the account holds.`
      : v.survives
        ? `About ${k(Math.max(0, v.spare))} left in the account at the end.`
        : `${v.monthsShort.toFixed(1)} months short. About ${k(v.moneyNeeded)} more in the account would cover it.`;

  const pick = (s: Shock) => {
    setShock(s);
    setHeard([]);
  };

  return (
    <div data-fill className="grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(360px,5fr)_minmax(0,8fr)] lg:grid-rows-[minmax(0,1fr)]">
      {/* ---------------- left: scenario controls */}
      <section className="ws-panel p-3 lg:min-h-0" aria-label="Scenario controls">
        <div className="flex items-center gap-2 rounded-xl border border-glass-border bg-glass p-1 pl-3 focus-within:border-accent">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && read()}
            placeholder="Describe it, e.g. “I lose my job (EI at 55%) and rent goes up $200 a month”"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
            aria-label="Describe a what-if"
          />
          <button onClick={read} className="btn btn-primary rounded-lg px-3.5 py-1.5 text-xs">
            Apply
          </button>
        </div>
        <AnimatePresence>
          {heard.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1.5 flex flex-wrap gap-1" aria-live="polite">
              {heard.map((h) => (
                <span key={h} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-ink">
                  {h}
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-2.5 flex items-center gap-2">
          <TabBar
            idBase="shock-left"
            label="Shock controls"
            value={left}
            onChange={setLeft}
            className="flex-1"
            tabs={[
              { value: "presets", label: "Presets" },
              { value: "custom", label: "My shocks" },
              {
                value: "adjust",
                label: (
                  <span className="inline-flex items-center gap-1">
                    <SlidersHorizontal className="size-3" aria-hidden /> Adjust
                  </span>
                ),
              },
            ]}
          />
          {has && (
            <button onClick={() => setShock(NO_SHOCK)} className="btn btn-outline shrink-0 rounded-full px-2.5 py-1 text-[11px]">
              Clear
            </button>
          )}
        </div>

        <div id="shock-left-panel" role="tabpanel" aria-labelledby={`shock-left-tab-${left}`} className="ws-scroll mt-2 flex-1 pr-1">
          {left === "presets" && <ShockLibrary bare m={m} shock={shock} onPick={pick} />}
          {left === "custom" && (
            <CustomShocks
              bare
              m={m}
              mode={mode}
              shock={shock}
              start={start}
              now={now}
              onRun={(s, st) => {
                pick(s);
                setStart(st);
              }}
            />
          )}
          {left === "adjust" && (
            <div>
              <p className="mb-3 text-xs text-ink-2">
                Every value here is a hypothetical assumption. Dollar effects use this account&apos;s own medians. Tap ? for what a field means.
              </p>
              <ShockControls m={m} shock={shock} setShock={setShock} income={sc.income} />
            </div>
          )}
        </div>
      </section>

      {/* ---------------- right: simulation results */}
      <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-label="Simulation results" aria-live="polite">
        <div className={`ws-panel shrink-0 p-3 transition-shadow ${has ? "border-accent/40 ring-2 ring-accent-soft" : ""}`}>
          <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
            <RunwayRing runway={sc.runway} size={118} compact caption={has ? (v.survives ? "Covers it" : v.wipedOut ? "Can't cover" : "Runs short") : undefined} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-accent-ink">
                {has ? (
                  <>
                    <span className="truncate">{shockLabel(shock)}</span>
                    <span className="text-muted">· was {months(base.runway)} mo</span>
                  </>
                ) : (
                  "No shock applied yet"
                )}
                <ProvTip k="runway" />
              </div>
              <h2 className="mt-0.5 text-xl leading-tight font-semibold tracking-tight xl:text-2xl">{headline}</h2>
              <p className="mt-0.5 text-sm text-ink-2">{sub}</p>
              {has && (
                <div className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-xs break-words text-ink-2" title="Months = balance left after one-time costs ÷ (monthly spending − monthly money in)">
                  {sc.bufferLeft <= 0
                    ? `${k(m.B)} balance − ${k(sc.oneOff)} one-time costs ≤ 0  →  0 months`
                    : sc.gap <= 0
                      ? `money in ${k(sc.income)} ≥ spending ${k(sc.spending)}  →  no monthly shortfall`
                      : `${k(sc.bufferLeft)} left ÷ ${k(sc.gap)} monthly shortfall  =  ${months(sc.runway)} months`}
                </div>
              )}
            </div>
            {has && (
              <div className="flex shrink-0 flex-col items-end gap-1.5 text-right text-xs text-ink-2">
                <span className="max-w-[13rem]">
                  <b className="tnum text-ink">{Math.round(share * 100)}%</b> of the {all.length.toLocaleString("en-CA")} accounts in this data wouldn&apos;t be covered for {shock.durationMonths} months
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
                <NextButton onClick={onNext} small>
                  Recovery Plan
                </NextButton>
              </div>
            )}
          </div>
        </div>

        <ImpactTiles m={m} shock={shock} mode={mode} start={start} />

        <div className="ws-panel min-h-[320px] flex-1 p-3 lg:min-h-0">
          <TabBar
            idBase="shock-right"
            label="Result details"
            value={right}
            onChange={setRight}
            className="w-fit self-start"
            tabs={[
              { value: "chart", label: "Financial impact" },
              { value: "plan", label: "Recommendations" },
              { value: "explain", label: "Explanation" },
            ]}
          />
          <div id="shock-right-panel" role="tabpanel" aria-labelledby={`shock-right-tab-${right}`} className="mt-2 flex min-h-0 flex-1 flex-col">
            {!has ? (
              <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-2">
                <div>
                  <p className="font-semibold text-ink">Pick a preset, type a twist card, or adjust values on the left.</p>
                  <p className="mt-1 text-xs text-muted">The tiles above show account #{m.id} with no changes: its own medians from monthly_summary.csv and loans.csv.</p>
                </div>
              </div>
            ) : right === "chart" ? (
              <ImpactChart m={m} shock={shock} mode={mode} start={start} setStart={setStart} />
            ) : right === "plan" ? (
              <div className="ws-scroll flex-1 pr-1">
                <p className="mb-2 text-xs text-ink-2">Backup moves for this shock, in order. Each adds runway using this account&apos;s own flexible spending and loan payment.</p>
                <ol className="space-y-2">
                  {shock.jobLoss && <PlanStep n={1} title="Apply for EI right away" detail="Within 4 weeks of the last day of work" />}
                  {steps.slice(1).map((s, i) => (
                    <PlanStep
                      key={s.label}
                      n={i + (shock.jobLoss ? 2 : 1)}
                      title={s.label}
                      detail={s.detail}
                      gain={s.gained === null ? "no shortfall" : s.gained > 0 ? `+${s.gained.toFixed(1)} mo` : undefined}
                    />
                  ))}
                  {steps.length <= 1 && !shock.jobLoss && <li className="text-sm text-ink-2">This account has no flexible spending or running loan to adjust, so there are no backup moves to test.</li>}
                </ol>
                <p className="mt-3 text-xs text-muted">
                  Runway with every move: <b className="tnum text-ink">{months(steps[steps.length - 1]?.runway ?? sc.runway)} months</b>. The full goal plan is on the Plan step.
                </p>
              </div>
            ) : (
              <div className="ws-scroll flex-1 pr-1 text-sm leading-relaxed text-ink-2">
                {impactStory(m, shock, sc, p, mode).map((t) => (
                  <p key={t} className="mb-2">
                    {t}
                  </p>
                ))}
                <p className="text-xs text-muted">A hypothetical projection from past account data and the assumptions on the left, not a forecast or a record of real events.</p>
              </div>
            )}
          </div>
        </div>
      </section>
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
