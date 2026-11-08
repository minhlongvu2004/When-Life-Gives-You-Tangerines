"use client";

import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthRow } from "@/lib/data";
import { NO_SHOCK, scenario, type Metrics, type Mode, type Shock } from "@/lib/engine";
import {
  HORIZON,
  REBUILD_SHARE,
  REPAY_MONTHS,
  durationWords,
  essentialsBasis,
  monthlyBridge,
  planDefs,
  recoveryInputs,
  roundedMoney as M,
  simulateRecovery,
  type BridgeRow,
  type PlanDef,
  type RecoveryResult,
} from "@/lib/recovery";
import { compact } from "./charts";
import { Disclosure, isShock, shockLabel } from "./guided";
import { LegendKey, Segmented } from "./ui";

const axis = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;
const EI_FALLBACK: Shock = { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 };
const when = (n: number | null, zero: string) => (n === null ? "Not within 8 years" : n === 0 ? zero : n > 12 ? `Month ${n} · ${durationWords(n)}` : `Month ${n}`);

/* ------------------------------------------------------------------ the page */

export function StepPlan({ m, mode, shock, rows, onRestart }: { m: Metrics; mode: Mode; shock: Shock; rows: MonthRow[]; onRestart: () => void }) {
  const has = isShock(shock);
  const eff = has ? shock : EI_FALLBACK;
  const D = eff.durationMonths;
  const defs = useMemo(() => planDefs(m), [m]);
  const plans = defs.filter((p) => p.key !== "none");
  const [planKey, setPlanKey] = useState<string>("B");
  const [target, setTarget] = useState<3 | 6>(3);
  const [longer, setLonger] = useState(false);
  const [refused, setRefused] = useState(false);
  const sel: PlanDef = defs.find((p) => p.key === planKey) ?? plans[Math.min(1, plans.length - 1)] ?? defs[0];
  const none = defs[0];
  const ess = essentialsBasis(m);
  const unit = ess.labelled ? "essentials" : "spending"; // no labelled bills: all monthly spending stands in for essentials
  const targetAmount = target * ess.monthly;
  const extra = longer ? 3 : 0;
  const canRefuse = sel.deferral;
  const refusedNow = refused && canRefuse;

  const run = (p: PlanDef, o: { extra?: number; refused?: boolean } = {}) =>
    simulateRecovery(recoveryInputs(m, eff, mode, p, { targetMonths: target, extraMonths: o.extra ?? 0, deferralRefused: o.refused ?? false }));

  const base = useMemo(() => run(sel), [m, eff, mode, sel, target]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = useMemo(() => run(sel, { extra, refused: refusedNow }), [m, eff, mode, sel, target, extra, refusedNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const noChange = useMemo(() => run(none, { extra }), [m, eff, mode, none, target, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const table = useMemo(
    () => defs.map((p) => ({ def: p, res: run(p, { extra, refused: refused && p.deferral }) })),
    [m, eff, mode, defs, target, extra, refused], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const longerOn = useMemo(() => run(sel, { extra: 3, refused: refusedNow }), [m, eff, mode, sel, target, refusedNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const longerOff = useMemo(() => run(sel, { extra: 0, refused: refusedNow }), [m, eff, mode, sel, target, refusedNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const refusedOn = useMemo(() => (canRefuse ? run(sel, { extra, refused: true }) : null), [m, eff, mode, sel, target, extra, canRefuse]); // eslint-disable-line react-hooks/exhaustive-deps
  const refusedOff = useMemo(() => (canRefuse ? run(sel, { extra, refused: false }) : null), [m, eff, mode, sel, target, extra, canRefuse]); // eslint-disable-line react-hooks/exhaustive-deps
  const bridge = useMemo(() => monthlyBridge(m, eff, mode, sel, { deferralRefused: refusedNow }), [m, eff, mode, sel, refusedNow]);
  const during = scenario(m, eff, mode);
  const changed = longer || refusedNow;

  return (
    <div data-scroll-page className="space-y-6 pb-6">
      <header className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Recovery plan</h2>
        <p className="mt-1 text-ink-2">
          {shockLabel(eff)} · {D} months
        </p>
        {!has && (
          <p className="mx-auto mt-2 max-w-xl rounded-xl bg-warning-soft px-4 py-2 text-sm text-ink">
            No what-if was set up, so this shows a job loss with an EI estimate (55% of income for 6 months). Set one up on the previous step to see your own.
          </p>
        )}
      </header>

      <div className="rounded-3xl border border-accent/40 bg-surface p-5 shadow-sm ring-4 ring-accent-soft">
        <p className="text-lg leading-snug font-medium">
          <Answer plan={sel} res={current} D={D + extra} target={target} />
        </p>
        <p className="mt-2 text-sm text-muted">
          A projection from this account&apos;s records and the assumptions below, not a prediction. Savings, debts and bills elsewhere aren&apos;t included.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm text-ink-2">Target</span>
          <Segmented<"3" | "6">
            size="sm"
            value={String(target) as "3" | "6"}
            onChange={(v) => setTarget(v === "6" ? 6 : 3)}
            options={[
              { value: "3", label: `3 months of ${unit}` },
              { value: "6", label: "6 months (stretch)" },
            ]}
          />
          <span className="tnum text-sm font-semibold">{M(targetAmount)}</span>
        </div>
      </div>

      {/* ---- 1. where things stand */}
      <Section phase="Phase 1 · Get through the disruption" title="Where things stand" id="rp-stand">
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label="Money available today" value={M(m.B)} note="Average balance of this account, last 6 months" />
          <Fact label={ess.labelled ? "Essentials we can see" : "Monthly spending"} value={`${M(ess.monthly)} a month`} note={ess.labelled ? "Bills, insurance and loan payments labelled in this account" : "No bills are labelled in this account, so all monthly spending counts as essential"} />
          <Fact
            label={bridge.netNoChange < 0 ? "Short each month during the disruption" : "Left over each month during the disruption"}
            value={M(Math.abs(bridge.netNoChange))}
            note={`Money in ${M(during.income)}${eff.jobLoss ? " (EI estimate)" : ""} minus money out ${M(during.spending)}`}
            tone={bridge.netNoChange < 0 ? "bad" : "ok"}
          />
        </div>
        <Disclosure label="What counts as recovered?">
          <ul className="space-y-2 text-sm text-ink-2">
            <li>
              <b className="text-ink">Stable:</b> money in covers money out each month.
            </li>
            <li>
              <b className="text-ink">Caught up:</b> anything the account couldn&apos;t cover is cleared, and the account is back above one month of {unit} ({M(ess.monthly)}).
            </li>
            <li>
              <b className="text-ink">Buffer target:</b> {target} months of {unit} ({M(targetAmount)}). The Financial Consumer Agency of Canada and Tangerine both describe 3 to 6 months of expenses as a common goal.
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted">Getting back to the old balance isn&apos;t a goal here. It is just a reference line.</p>
        </Disclosure>
      </Section>

      {/* ---- 2. what you could change */}
      <Section phase="Phase 1 · Get through the disruption" title="What you could change" id="rp-change">
        {plans.length > 0 ? (
          <>
            <div role="group" aria-label="Choose a plan" className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPlanKey(p.key)}
                  aria-pressed={sel.key === p.key}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    sel.key === p.key ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface/70 text-ink-2 hover:border-accent/60 hover:text-ink"
                  }`}
                >
                  <b>{p.key}</b> · {p.name}
                </button>
              ))}
            </div>
            <MonthlyBridge rows={bridge.rows} netNoChange={bridge.netNoChange} netWithPlan={bridge.netWithPlan} planName={sel.name} />
            <PlanComparison
              rows={table.map((t) => ({ ...t, effort: effortOf(m, t.def, refused), pct: m.S - ess.monthly > 0 ? effortOf(m, t.def, refused).trim / (m.S - ess.monthly) : 0 }))}
              selected={sel.key}
              onSelect={setPlanKey}
              D={D + extra}
              targetLabel={`${target} months of ${unit}`}
              unit={unit}
            />
          </>
        ) : (
          <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink-2">
            This account shows no card, cash or other spending to trim and no running loan to ask about, so there are no spending changes to model. Look at income support (such as EI), lower
            fixed bills, or talk to a nonprofit credit counsellor.
          </p>
        )}
      </Section>

      {/* ---- 3. what could happen next */}
      <Section phase="Phase 1 and Phase 2" title="What could happen next" id="rp-next">
        <FundsChart rows={rows} sel={sel} current={current} base={changed ? base : null} none={noChange} D={D + extra} target={targetAmount} starter={ess.monthly} targetMonths={target} unit={unit} />
        <Milestones res={current} D={D + extra} starter={ess.monthly} targetAmount={targetAmount} targetMonths={target} unit={unit} />
      </Section>

      {/* ---- 4. what could change this */}
      <Section phase="Assumptions" title="What could change this" id="rp-change-this">
        <p className="text-sm text-ink-2">These are illustrative what-ifs, not statistical ranges. Switch one on to rerun the plan.</p>
        <div className="flex flex-wrap gap-2">
          <Chip on={longer} onClick={() => setLonger(!longer)} label="The disruption lasts 3 months longer" effect={`Target: ${durationWords(longerOn.targetMonth)} with it, ${durationWords(longerOff.targetMonth)} without`} />
          {canRefuse && (
            <Chip
              on={refused}
              onClick={() => setRefused(!refused)}
              label="The lender says no to the deferral"
              effect={refusedOn && refusedOff ? `Target: ${durationWords(refusedOn.targetMonth)} with it, ${durationWords(refusedOff.targetMonth)} without` : ""}
            />
          )}
        </div>
        <Disclosure label="Assumptions and what isn't included">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>This uses one account&apos;s records. Other accounts, savings, debts and bills paid elsewhere aren&apos;t included.</li>
            <li>&quot;Money in&quot; is everything deposited, not only pay. Pension income is not treated as proof of retirement.</li>
            <li>The EI figure is an estimate. Service Canada decides eligibility and the amount, and benefits are taxable.</li>
            <li>Income and spending return to normal after month {D}, and any cuts stop then.</li>
            <li>
              Card, cash and other transfers are treated as spending you could trim. Some of it may be essential, like groceries, so treat the cuts as assumptions you choose.
            </li>
            <li>A deferral is up to the lender. We assume the missed payments are repaid over {REPAY_MONTHS} months afterwards, with no interest added, so the real cost would be higher.</li>
            <li>
              After the disruption, {Math.round(REBUILD_SHARE * 100)}% of each month&apos;s leftover goes first to anything unpaid, then to the buffer. Nothing is saved in a month with a shortfall.
            </li>
            <li>Any money a plan frees up is counted once: a cut that helps during the disruption isn&apos;t counted again as savings.</li>
            <li>Dollar amounts and dates are rounded on purpose. They are estimates.</li>
          </ul>
        </Disclosure>
      </Section>

      {/* ---- 5. next steps */}
      <Section phase="Next steps" title="What to do now, and later" id="rp-steps">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-sm font-semibold">Phase 1 · Get through it</div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              {eff.jobLoss && <li>Apply for EI as soon as your job ends. Canada.ca explains how and the deadline.</li>}
              <li>Use savings first, to avoid adding new credit card or loan debt.</li>
              {m.P > 0 && <li>Tell your lender early if payments will be hard. Ask what relief is possible and what it costs.</li>}
              <li>Check whether any loan or credit insurance covers a job loss.</li>
              <li>Keep paying essentials first. A nonprofit credit counsellor can help you decide what can wait.</li>
            </ul>
            <a
              href="https://www.canada.ca/en/financial-consumer-agency/services/losing-job.html"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm text-accent-ink underline-offset-2 hover:underline"
            >
              FCAC: Losing your job <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-sm font-semibold">Phase 2 · Rebuild</div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Start with a small first step, then raise it when you can.</li>
              <li>Move the money the day after payday, so it happens without thinking about it.</li>
              <li>Keep the fund in a separate account, so it isn&apos;t spent by accident.</li>
              <li>Clear anything unpaid first. Then build toward the target.</li>
            </ul>
          </div>
        </div>
      </Section>

      <div className="text-center">
        <button onClick={onRestart} className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-2 hover:text-ink">
          Try another customer →
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces */

function effortOf(m: Metrics, p: PlanDef, refused: boolean) {
  const trim = p.levers.discCut * m.disc;
  const defer = p.levers.pauseLoan && !(refused && p.deferral) && m.P > 0 ? m.P : 0;
  return { trim, defer, total: trim + defer };
}

function Section({ phase, title, id, children }: { phase: string; title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <div className="text-xs font-semibold tracking-wide text-accent-ink uppercase">{phase}</div>
        <h3 id={id} className="text-xl font-semibold tracking-tight">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "bad" | "ok" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tnum mt-1 text-2xl font-semibold tracking-tight ${tone === "bad" ? "text-critical-text" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-ink-2">{note}</div>
    </div>
  );
}

function Chip({ on, onClick, label, effect }: { on: boolean; onClick: () => void; label: string; effect: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-2xl border px-4 py-2.5 text-left text-sm transition-colors ${on ? "border-accent bg-accent-soft" : "border-line bg-surface/70 hover:border-accent/60"}`}
    >
      <div className="font-medium">{on ? "✓ " : ""}{label}</div>
      <div className="tnum mt-0.5 text-xs text-ink-2">{effect}</div>
    </button>
  );
}

const planName = (p: PlanDef) => (p.key === "none" ? "no changes" : `plan ${p.key} (${p.name.toLowerCase()})`);

/** The one-sentence answer at the top. */
function Answer({ plan, res, D, target }: { plan: PlanDef; res: RecoveryResult; D: number; target: number }) {
  const first =
    res.runsOutMonth === null
      ? `With ${planName(plan)}, the account covers all ${D} months.`
      : res.runsOutMonth === 0
        ? "The one-time costs alone use up the account."
        : `With ${planName(plan)}, the account runs short in month ${res.runsOutMonth} of ${D}${res.peakGap > 0 ? `, leaving about ${M(res.peakGap)} of bills and spending uncovered` : ""}.`;
  const second =
    res.targetMonth === null
      ? ` At these settings it doesn't reach the ${target}-month target within 8 years.`
      : res.targetMonth === 0
        ? ` It stays above the ${target}-month target.`
        : ` Rebuilding to the ${target}-month target could take ${durationWords(res.targetMonth)}.`;
  return (
    <>
      {first}
      {second}
    </>
  );
}

/* ------------------------------------------------------------------ chart 2: monthly money in and out */

function MonthlyBridge({ rows, netNoChange, netWithPlan, planName }: { rows: BridgeRow[]; netNoChange: number; netWithPlan: number; planName: string }) {
  // each bar runs from `from` to `to` (dollars); money in/out and changes walk along a running total
  const bars = useMemo(() => {
    let run = 0;
    return rows.map((r) => {
      let from = 0;
      let to = r.value;
      if (r.kind === "out" || r.kind === "change") {
        from = run;
        to = run + r.value;
      }
      if (r.kind === "in") run = r.value;
      if (r.kind === "out") run = to;
      if (r.kind === "result") run = r.value;
      if (r.kind === "change") run = to;
      return { r, from, to };
    });
  }, [rows]);
  const lo = Math.min(0, ...bars.flatMap((b) => [b.from, b.to]));
  const hi = Math.max(0, ...bars.flatMap((b) => [b.from, b.to]));
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  const hatch = "repeating-linear-gradient(45deg, var(--critical) 0 2px, transparent 2px 6px)";
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
  const better = netWithPlan - netNoChange;
  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h4 className="text-sm font-semibold">Monthly money in and out, during the disruption</h4>
      <p className="mt-0.5 text-xs text-muted">Dollars per month. A minus sign and hatching mean money going out or short; a plus sign means money in or a change that helps.</p>
      <ol className="mt-4 space-y-2.5">
        {bars.map(({ r, from, to }) => {
          const left = pos(Math.min(from, to));
          const width = Math.max(0.8, Math.abs(pos(to) - pos(from)));
          const short = r.kind === "result" && r.value < 0;
          const style =
            r.kind === "in"
              ? { background: "var(--series-1)" }
              : r.kind === "change"
                ? { background: "var(--series-2)" }
                : r.kind === "result"
                  ? short
                    ? { backgroundImage: hatch, border: "1.5px solid var(--critical)" }
                    : { background: "var(--good)" }
                  : { background: "repeating-linear-gradient(45deg, var(--axis) 0 2px, transparent 2px 6px)", border: "1.5px solid var(--ink-2)" };
          return (
            <li key={r.key} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[13rem_1fr_5.5rem] ${r.kind === "result" ? "font-semibold" : ""}`}>
              <span className="text-sm text-ink-2 md:col-start-1 md:row-start-1 md:text-right">{r.label}</span>
              <span className="relative col-span-2 row-start-2 h-5 md:col-span-1 md:col-start-2 md:row-start-1" aria-hidden>
                <span className="absolute inset-y-0 w-px bg-axis" style={{ left: `${pos(0)}%`, background: "var(--axis)" }} />
                <span className="absolute top-0.5 h-4 rounded-sm" style={{ left: `${left}%`, width: `${width}%`, ...style }} />
              </span>
              <span className={`tnum text-right text-sm md:col-start-3 md:row-start-1 ${short ? "text-critical-text" : ""}`}>
                {sign(r.value)}
                {M(Math.abs(r.value))}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm text-ink-2">
        {netWithPlan < 0 ? (
          <>
            With {planName.toLowerCase()}, the account is still <b className="text-critical-text">short about {M(-netWithPlan)} a month</b>
            {better > 0 && <>, {M(better)} better than doing nothing</>}. Spending changes alone don&apos;t close it. Look at income support, lower fixed bills, or credit counselling.
          </>
        ) : (
          <>
            With {planName.toLowerCase()}, <b>about {M(netWithPlan)} is left over each month</b>
            {better > 0 && <>, {M(better)} better than doing nothing</>}.
          </>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ chart 3: compare options */

type CompareRow = { def: PlanDef; res: RecoveryResult; effort: { trim: number; defer: number; total: number }; pct: number };

function PlanComparison({ rows, selected, onSelect, D, targetLabel, unit }: { rows: CompareRow[]; selected: string; onSelect: (k: string) => void; D: number; targetLabel: string; unit: string }) {
  const maxEffort = Math.max(1, ...rows.map((r) => r.effort.total));
  const maxTime = Math.max(12, ...rows.map((r) => r.res.targetMonth ?? 0));
  const runs = (r: RecoveryResult) =>
    r.runsOutMonth === null ? (
      <span className="inline-flex items-center gap-1">
        <CheckCircle2 className="size-4 text-good-text" aria-hidden /> Lasts all {D} months
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-critical-text">
        <AlertTriangle className="size-4" aria-hidden /> {r.runsOutMonth === 0 ? "Already out" : `Runs short in month ${r.runsOutMonth}`}
      </span>
    );
  const effortText = (r: CompareRow) => (r.effort.total <= 0 ? "None" : `${M(r.effort.total)} less a month${r.effort.defer > 0 ? ` (incl. ${M(r.effort.defer)} loan payment deferred)` : ""}`);
  const notes = (r: CompareRow) => [r.def.deferral ? "Needs lender approval; missed payments are repaid later" : "", r.def.key === "C" ? "Needs the biggest change" : ""].filter(Boolean);
  const bar = (frac: number, text: string, color: string) => (
    <div>
      <div className="h-2 rounded-full bg-surface-2">
        <div className="h-2 rounded-full" style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, background: color }} />
      </div>
      <div className="tnum mt-1 text-xs text-ink-2">{text}</div>
    </div>
  );
  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h4 className="text-sm font-semibold">Compare the ways through</h4>
      <p className="mt-0.5 text-xs text-muted">Same assumptions for every row. Select a row to see it in the charts. Faster isn&apos;t always better: check what each one asks of you.</p>
      {/* wide screens */}
      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 font-medium">Change needed each month</th>
              <th className="py-2 pr-3 font-medium">Account during the disruption</th>
              <th className="py-2 pr-3 font-medium">Most left unpaid</th>
              <th className="py-2 pr-3 font-medium">Back above 1 month of {unit}</th>
              <th className="py-2 font-medium">Reaches {targetLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.def.key} className={`border-t border-line align-top ${selected === r.def.key ? "bg-accent-soft/50" : ""}`}>
                <td className="py-3 pr-3">
                  {r.def.key === "none" ? (
                    <span className="font-medium">{r.def.name}</span>
                  ) : (
                    <button onClick={() => onSelect(r.def.key)} aria-pressed={selected === r.def.key} className="text-left font-medium underline-offset-2 hover:underline">
                      {r.def.key} · {r.def.name}
                    </button>
                  )}
                  {notes(r).map((n) => (
                    <div key={n} className="mt-1 text-xs text-muted">
                      {n}
                    </div>
                  ))}
                </td>
                <td className="py-3 pr-3">{bar(r.effort.total / maxEffort, effortText(r), "var(--series-2)")}</td>
                <td className="py-3 pr-3">{runs(r.res)}</td>
                <td className="tnum py-3 pr-3">{r.res.peakGap > 0 ? M(r.res.peakGap) : "$0"}</td>
                <td className="py-3 pr-3">{when(r.res.backToStarterMonth, "Never fell below")}</td>
                <td className="py-3">{bar((r.res.targetMonth ?? maxTime) / maxTime, r.res.targetMonth === null ? "Not within 8 years" : r.res.targetMonth === 0 ? "Already there" : durationWords(r.res.targetMonth), "var(--series-1)")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* phones */}
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.def.key} className={`rounded-2xl border p-3 text-sm ${selected === r.def.key ? "border-accent bg-accent-soft/50" : "border-line"}`}>
            {r.def.key === "none" ? (
              <div className="font-medium">{r.def.name}</div>
            ) : (
              <button onClick={() => onSelect(r.def.key)} aria-pressed={selected === r.def.key} className="font-medium underline-offset-2 hover:underline">
                {r.def.key} · {r.def.name}
              </button>
            )}
            {notes(r).map((n) => (
              <div key={n} className="mt-0.5 text-xs text-muted">
                {n}
              </div>
            ))}
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
              <dt className="text-ink-2">Change each month</dt>
              <dd className="tnum text-right">{effortText(r)}</dd>
              <dt className="text-ink-2">Account</dt>
              <dd className="text-right">{runs(r.res)}</dd>
              <dt className="text-ink-2">Most left unpaid</dt>
              <dd className="tnum text-right">{r.res.peakGap > 0 ? M(r.res.peakGap) : "$0"}</dd>
              <dt className="text-ink-2">Back above 1 month</dt>
              <dd className="text-right">{when(r.res.backToStarterMonth, "Never fell below")}</dd>
              <dt className="text-ink-2">Reaches target</dt>
              <dd className="text-right">{r.res.targetMonth === null ? "Not within 8 years" : r.res.targetMonth === 0 ? "Already there" : durationWords(r.res.targetMonth)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ chart 1: money available over time */

function FundsChart({
  rows,
  sel,
  current,
  base,
  none,
  D,
  target,
  starter,
  targetMonths,
  unit,
}: {
  rows: MonthRow[];
  sel: PlanDef;
  current: RecoveryResult;
  base: RecoveryResult | null;
  none: RecoveryResult;
  D: number;
  target: number;
  starter: number;
  targetMonths: number;
  unit: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [month, setMonth] = useState(0);
  const reach = [current.targetMonth, none.targetMonth];
  const H = reach.some((x) => x === null) ? 60 : Math.min(HORIZON, Math.max(24, ...reach.map((x) => (x ?? 0) + 6)));
  const hist = useMemo(() => rows.slice(-12), [rows]);
  const data = useMemo(() => {
    type Point = { month: number; hist?: number; none?: number; plan?: number; base?: number; gapPlan?: number; gapNone?: number };
    const out: Point[] = [];
    // recorded month-end balances to the left of "Now" (not connected to the projection)
    hist.forEach((r, i) => {
      const t = i - (hist.length - 1);
      if (t < 0) out.push({ month: t, hist: r.month_end_balance });
    });
    for (let t = 0; t <= H; t++) {
      const p: Point = { month: t, none: none.rows[t].funds, plan: current.rows[t].funds, gapPlan: current.rows[t].gap, gapNone: none.rows[t].gap };
      if (t === 0 && hist.length) p.hist = hist[hist.length - 1].month_end_balance;
      if (base) p.base = base.rows[t].funds;
      out.push(p);
    }
    return out;
  }, [hist, H, none, current, base]);
  const xMin = hist.length ? -(hist.length - 1) : 0;
  const ticks = useMemo(() => {
    const step = H > 48 ? 12 : 6;
    const t: number[] = hist.length ? [xMin] : [];
    for (let x = 0; x <= H; x += step) t.push(x);
    return t;
  }, [H, xMin, hist.length]);
  const tick = (t: number) => (t === 0 ? "Now" : t < 0 ? `${t}` : `M${t}`);
  const showGap = current.peakGap > 0 || none.peakGap > 0;
  const startFunds = current.rows[0].funds;
  const latest = hist.length ? hist[hist.length - 1].month_end_balance : null;
  const sm = Math.min(month, H);
  const at = (r: RecoveryResult) => r.rows[sm];

  const summary =
    `Line chart of money available in this account over the next ${H} months. ` +
    `It starts at ${M(startFunds)}. ` +
    (current.runsOutMonth === null
      ? `With ${sel.key === "none" ? "no changes" : `plan ${sel.key}`}, it never reaches $0. `
      : `With plan ${sel.key}, it reaches $0 in month ${current.runsOutMonth}${current.peakGap > 0 ? ` and about ${M(current.peakGap)} of bills and spending goes uncovered` : ""}. `) +
    `Without changes, it reaches $0 in ${none.runsOutMonth === null ? "no month" : `month ${none.runsOutMonth}`}${none.peakGap > 0 ? ` and up to ${M(none.peakGap)} goes uncovered` : ""}. ` +
    `Target: ${M(target)} (${targetMonths} months of ${unit}), ${current.targetMonth === null ? "not reached within 8 years" : current.targetMonth === 0 ? "already met" : `reached in month ${current.targetMonth} with the plan`}.`;

  const tableMonths = useMemo(() => {
    const set = new Set<number>([0, D, D + 1, H]);
    for (let t = 0; t <= H; t += H > 24 ? 3 : 1) set.add(t);
    [current.runsOutMonth, current.caughtUpMonth, current.targetMonth, none.targetMonth].forEach((x) => x !== null && x <= H && set.add(x));
    return [...set].filter((t) => t >= 0 && t <= H).sort((a, b) => a - b);
  }, [H, D, current, none]);

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Money available in this account, month by month</h4>
        <div className="flex flex-wrap gap-3">
          {hist.length > 0 && <LegendKey color="var(--series-1)" label="Recorded balance" />}
          <LegendKey color="var(--ink-2)" label="No changes" dashed />
          <LegendKey color="var(--series-2)" label={sel.key === "none" ? "No changes" : `Plan ${sel.key}`} />
          {base && <LegendKey color="var(--series-2)" label="Before the what-if above" dashed />}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <li>
          <span className="mr-1 inline-block h-2.5 w-4 rounded-sm align-middle" style={{ background: "color-mix(in srgb, var(--series-2) 18%, transparent)" }} aria-hidden />
          Shaded: the disruption (months 1–{D})
        </li>
        <li>Solid vertical line: where the projection starts</li>
        {current.runsOutMonth !== null && current.runsOutMonth > 0 && current.runsOutMonth <= H && (
          <li>
            <span className="mr-1 inline-block w-4 border-t-2 border-dashed align-middle" style={{ borderColor: "var(--critical)" }} aria-hidden />
            Red dashed line: the account runs short (month {current.runsOutMonth})
          </li>
        )}
        <li>
          <span className="mr-1 inline-block w-4 border-t-2 border-dotted align-middle" style={{ borderColor: "var(--good)" }} aria-hidden />
          Green dotted line: the target
        </li>
      </ul>
      <div className="mt-2" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 26, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis type="number" dataKey="month" domain={[xMin, H]} ticks={ticks} tickFormatter={tick} allowDecimals={false} {...axis} />
            <YAxis domain={[0, (max: number) => Math.max(max, target * 1.15)]} tickFormatter={compact} width={56} axisLine={false} {...axis} />
            <ReferenceArea x1={0} x2={D} fill="var(--series-2)" fillOpacity={0.08} stroke="none" />
            <ReferenceLine x={0} stroke="var(--ink-2)" strokeWidth={1} />
            <ReferenceLine y={target} stroke="var(--good)" strokeDasharray="2 4" strokeWidth={1.5} label={{ value: `Target ${compact(target)}`, position: "insideTopRight", fill: "var(--good-text)", fontSize: 11 }} />
            <ReferenceLine y={starter} stroke="var(--axis)" strokeDasharray="2 4" label={{ value: `1 month ${compact(starter)}`, position: "insideBottomRight", fill: "var(--muted)", fontSize: 10 }} />
            <ReferenceLine y={0} stroke="var(--ink-2)" strokeWidth={1.5} />
            {current.runsOutMonth !== null && current.runsOutMonth > 0 && current.runsOutMonth <= H && (
              <ReferenceLine x={current.runsOutMonth} stroke="var(--critical)" strokeDasharray="3 3" />
            )}
            {current.targetMonth !== null && current.targetMonth > 0 && current.targetMonth <= H && (
              <ReferenceDot x={current.targetMonth} y={target} r={5} fill="var(--good)" stroke="var(--surface)" strokeWidth={2} />
            )}
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, label }) => {
                const t = Number(label);
                if (!active || !(t >= 0)) return null;
                const c = current.rows[t];
                const n = none.rows[t];
                return (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                    <div className="mb-1 font-medium">Month {t}</div>
                    <div>
                      {sel.key === "none" ? "No changes" : `Plan ${sel.key}`}: {M(c.funds)} available{c.gap > 0 ? `, ${M(c.gap)} uncovered` : ""}
                    </div>
                    <div className="text-ink-2">
                      No changes: {M(n.funds)} available{n.gap > 0 ? `, ${M(n.gap)} uncovered` : ""}
                    </div>
                  </div>
                );
              }}
            />
            <Line dataKey="hist" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="none" stroke="var(--ink-2)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls={false} />
            {base && <Line dataKey="base" stroke="var(--series-2)" strokeWidth={1.5} strokeDasharray="2 3" strokeOpacity={0.8} dot={false} isAnimationActive={false} connectNulls={false} />}
            <Line dataKey="plan" stroke="var(--series-2)" strokeWidth={3} dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showGap && (
        <div className="mt-1">
          <div className="text-xs font-medium text-critical-text">Bills and spending the account couldn&apos;t cover (not available money)</div>
          <ResponsiveContainer width="100%" height={92}>
            <AreaChart data={data} margin={{ top: 6, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <pattern id={`hatch-${uid}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--critical)" strokeWidth="2" />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis type="number" dataKey="month" domain={[xMin, H]} ticks={ticks} tickFormatter={tick} allowDecimals={false} {...axis} />
              <YAxis domain={[0, (max: number) => Math.max(max, 100)]} tickFormatter={compact} width={56} axisLine={false} tickCount={3} {...axis} />
              <Area dataKey="gapNone" type="stepAfter" stroke="var(--ink-2)" strokeDasharray="6 4" fill="none" isAnimationActive={false} connectNulls={false} />
              <Area dataKey="gapPlan" type="stepAfter" stroke="var(--critical)" strokeWidth={2} fill={`url(#hatch-${uid})`} isAnimationActive={false} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Left of &quot;Now&quot; is the recorded month-end balance. The projection starts from the 6-month average balance ({M(startFunds)})
        {latest !== null ? `; the latest month-end balance was ${M(latest)}` : ""}. Shaded months are the disruption; after them, income and spending return to normal.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
        <label htmlFor={`${uid}-m`} className="font-medium">
          Check a month
        </label>
        <input id={`${uid}-m`} type="range" min={0} max={H} step={1} value={sm} onChange={(e) => setMonth(Number(e.target.value))} className="min-w-40 flex-1" />
        <span className="tnum w-full text-ink-2 sm:w-auto">
          <b className="text-ink">Month {sm}</b> · {sel.key === "none" ? "no changes" : `plan ${sel.key}`}: {M(at(current).funds)} available
          {at(current).gap > 0 ? `, ${M(at(current).gap)} uncovered` : ""} · no changes: {M(at(none).funds)} available{at(none).gap > 0 ? `, ${M(at(none).gap)} uncovered` : ""}
        </span>
      </div>
      <p className="mt-3 text-sm text-ink-2">{summary}</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-ink-2 hover:text-ink">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Money available and uncovered amount by month, for the plan and for no changes</caption>
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Month</th>
                <th scope="col" className="py-1 pr-3 font-medium">{sel.key === "none" ? "No changes" : `Plan ${sel.key}`}: available</th>
                <th scope="col" className="py-1 pr-3 font-medium">uncovered</th>
                <th scope="col" className="py-1 pr-3 font-medium">No changes: available</th>
                <th scope="col" className="py-1 font-medium">uncovered</th>
              </tr>
            </thead>
            <tbody>
              {tableMonths.map((t) => (
                <tr key={t} className="border-t border-line">
                  <th scope="row" className="py-1 pr-3 font-medium">{t === 0 ? "Now" : t}</th>
                  <td className="tnum py-1 pr-3">{M(current.rows[t].funds)}</td>
                  <td className="tnum py-1 pr-3">{M(current.rows[t].gap)}</td>
                  <td className="tnum py-1 pr-3">{M(none.rows[t].funds)}</td>
                  <td className="tnum py-1">{M(none.rows[t].gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ milestones */

function Milestones({ res, D, starter, targetAmount, targetMonths, unit }: { res: RecoveryResult; D: number; starter: number; targetAmount: number; targetMonths: number; unit: string }) {
  const items: { label: string; when: string; basis: string }[] = [
    {
      label: "Monthly shortfall ends",
      when: res.shortfallEndsMonth === null ? "Not within 8 years" : res.shortfallEndsMonth === 0 ? "No monthly shortfall" : `Month ${res.shortfallEndsMonth}`,
      basis: res.shortfallEndsMonth === null ? "Normal income doesn't cover normal spending in this account." : `Assumes income and spending return to normal after month ${D}.`,
    },
  ];
  if (res.peakGap > 0)
    items.push({
      label: "Unpaid amount cleared",
      when: when(res.caughtUpMonth, "Nothing unpaid"),
      basis: `Up to ${M(res.peakGap)} went uncovered. ${Math.round(REBUILD_SHARE * 100)}% of each month's leftover clears it first.`,
    });
  items.push({
    label: `Back above 1 month of ${unit} (${M(starter)})`,
    when: when(res.backToStarterMonth, "Never fell below"),
    basis: "Counted from the last month the account was below it.",
  });
  items.push({
    label: `Buffer target (${M(targetAmount)})`,
    when: when(res.targetMonth, "Already there"),
    basis: `${targetMonths} months of ${unit === "essentials" ? "essentials we can see in this account" : "spending, since no bills are labelled in this account"}.`,
  });
  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h4 className="text-sm font-semibold">Milestones (projected, not progress so far)</h4>
      <ol className="mt-3 space-y-3">
        {items.map((it, i) => (
          <li key={it.label} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
            <span className="grid size-6 place-items-center rounded-full bg-surface-2 text-xs font-semibold" aria-hidden>
              {i + 1}
            </span>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{it.label}</span>
                <span className="tnum text-sm">{it.when}</span>
              </div>
              <div className="text-xs text-muted">{it.basis}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
