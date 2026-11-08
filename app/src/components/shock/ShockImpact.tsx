"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import { money, scenario, type Metrics, type Mode, type Scenario, type Shock } from "@/lib/engine";
import type { ProvKey } from "@/lib/provenance";
import { projectShock, ymLabel, type Projection } from "@/lib/shocks";
import { addMonths, DATA_AS_OF, parseYM, ymString, type YM } from "@/lib/whatif/scenarios";
import { ShockProjectionChart } from "../charts";
import { InfoTip } from "../InfoTip";
import { ProvTip } from "../ProvTip";

const months = (r: number | null) => (r === null ? "120+" : r.toFixed(1));
const mo = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

/** First month a shock can start: the month after the data ends. */
export const firstShockMonth = (): YM => addMonths(DATA_AS_OF, 1);

export function useProjection(m: Metrics, shock: Shock, mode: Mode, start: string | null) {
  const startYM = (start && parseYM(start)) || firstShockMonth();
  const sc = scenario(m, shock, mode);
  const p = projectShock(m, shock, mode, startYM);
  return { startYM, sc, p, endYM: addMonths(startYM, shock.durationMonths - 1) };
}

/** Plain-language explanation of the projection. Every number is read from the engine's result. */
export function impactStory(m: Metrics, s: Shock, sc: Scenario, p: Projection, mode: Mode): string[] {
  const out: string[] = [];
  out.push(
    `Account #${m.id} typically brings in ${money(m.I)} and spends ${money(m.S)} a month (medians of its 2020–2025 monthly history), with a ${money(m.B)} savings buffer (average daily balance over its last six months, to Dec 2025).`,
  );
  out.push(
    `Under this hypothetical shock, income is ${money(sc.income)} and spending is ${money(sc.spending)} a month` +
      (sc.gap > 0 ? `, so savings fall by ${money(sc.gap)} a month.` : `, so they still put away ${money(-sc.gap)} a month.`),
  );
  if (sc.oneOff > 0)
    out.push(
      sc.bufferLeft <= 0
        ? `The one-off cost of ${money(sc.oneOff)} is more than their savings, so they're ${money(-sc.bufferLeft)} short the day it hits.`
        : `The one-off cost of ${money(sc.oneOff)} comes out first, leaving ${money(sc.bufferLeft)}.`,
    );
  if (sc.bufferLeft > 0)
    out.push(
      sc.runway === null
        ? "At that rate there's no shortfall, so the judged runway is 120+ months."
        : `If that rate never ended, savings would last ${months(sc.runway)} months (the judged, fixed-rate runway).`,
    );
  if (p.exhaustedAt === null) {
    out.push(
      p.afterGap >= 0
        ? `The shock ends after ${mo(s.durationMonths)} with ${money(p.balanceAtShockEnd)} left, then savings rebuild by about ${money(p.afterGap)} a month.`
        : `The shock ends after ${mo(s.durationMonths)} with ${money(p.balanceAtShockEnd)} left. Usual spending is still ${money(-p.afterGap)} a month more than income, so savings keep shrinking slowly.`,
    );
  } else if (p.exhaustedAt > 0 && p.exhaustedMonth) {
    out.push(
      p.exhaustedDuringShock
        ? `Because this shock lasts ${mo(s.durationMonths)}, the duration-aware projection runs out of savings in ${ymLabel(p.exhaustedMonth)}, month ${Math.ceil(p.exhaustedAt)} of the shock.`
        : `The shock ends after ${mo(s.durationMonths)}, but usual spending is already more than income, so savings still run out in ${ymLabel(p.exhaustedMonth)}.`,
    );
  }
  if (mode === "realistic") out.push("Income uses the realistic setting: the 2026 EI weekly maximum ($729), with pensions still paid.");
  return out;
}

function Tile({ label, value, sub, tone, help, prov }: { label: string; value: string; sub?: string; tone?: "good" | "critical"; help?: string; prov?: ProvKey }) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-2 ${tone === "critical" ? "border-critical/30 bg-critical-soft" : tone === "good" ? "border-good/30 bg-good-soft" : "border-glass-border bg-glass"}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
        <span className="truncate">{label}</span>
        {help && <InfoTip label={label}>{help}</InfoTip>}
        {prov && <ProvTip k={prov} />}
      </div>
      <motion.div
        key={value}
        initial={{ opacity: 0.35, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`tnum mt-0.5 truncate text-base font-semibold tracking-tight xl:text-lg ${tone === "critical" ? "text-critical-text" : tone === "good" ? "text-good-text" : ""}`}
        title={value}
      >
        {value}
      </motion.div>
      {sub && (
        <div className="truncate text-[11px] text-muted" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function ImpactTiles({ m, shock, mode, start }: { m: Metrics; shock: Shock; mode: Mode; start: string | null }) {
  const { sc, p, startYM, endYM } = useProjection(m, shock, mode, start);
  const short = sc.gap > 0;
  const runOut =
    p.exhaustedAt === null
      ? { value: "Doesn't run out", sub: `within ${mo(p.horizon)}` }
      : p.exhaustedAt === 0
        ? { value: ymLabel(startYM), sub: "the day the shock hits" }
        : { value: ymLabel(p.exhaustedMonth!), sub: p.exhaustedDuringShock ? `month ${Math.ceil(p.exhaustedAt)} of the shock` : "after the shock ends" };
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Tile
        label="Savings buffer"
        value={sc.oneOff > 0 ? `${money(m.B)} → ${money(sc.bufferLeft)}` : money(m.B)}
        sub={sc.oneOff > 0 ? `after ${money(sc.oneOff)} one-off` : "no one-off cost"}
        tone={sc.bufferLeft <= 0 ? "critical" : undefined}
        prov="B"
      />
      <Tile label="Income after shock" value={`${money(sc.income)}/mo`} sub={`usually ${money(m.I)} · ${sc.incomeNote}`} prov="I" />
      <Tile label="Spending after shock" value={`${money(sc.spending)}/mo`} sub={`usually ${money(m.S)} · ${sc.spendingNote}`} prov="S" />
      <Tile
        label={short ? "Monthly shortfall" : "Monthly surplus"}
        value={`${short ? "−" : "+"}${money(Math.abs(sc.gap))}/mo`}
        sub="income − spending, during the shock"
        tone={short ? "critical" : "good"}
      />
      <Tile
        label="Judged runway"
        value={sc.runway === null ? "120+ (no shortfall)" : `${months(sc.runway)} months`}
        sub="fixed rate · datathon formula"
        prov="runway"
      />
      <Tile label="Shock lasts" value={mo(shock.durationMonths)} sub={`${ymLabel(startYM)} – ${ymLabel(endYM)}`} />
      <Tile
        label="Savings run out"
        value={runOut.value}
        sub={runOut.sub}
        tone={p.exhaustedAt === null ? "good" : "critical"}
        help="From the duration-aware projection: the shock applies for its duration, then usual income and spending resume. The judged runway instead assumes the shock never ends."
      />
      <Tile
        label="Lowest balance"
        value={money(p.lowest.balance)}
        sub={p.lowest.t === 0 ? "right after one-off costs" : p.points[p.lowest.t].label}
        tone={p.lowest.balance < 0 ? "critical" : undefined}
      />
    </div>
  );
}

export function ImpactChart({ m, shock, mode, start, setStart }: { m: Metrics; shock: Shock; mode: Mode; start: string | null; setStart: (s: string | null) => void }) {
  const reduced = !!useReducedMotion();
  const { p, startYM } = useProjection(m, shock, mode, start);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          Duration-aware projection <ProvTip k="projection" />
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-2">
          <CalendarClock className="size-3.5 text-muted" aria-hidden />
          Shock starts
          <input
            type="month"
            value={ymString(startYM)}
            min={ymString(firstShockMonth())}
            onChange={(e) => setStart(e.target.value && parseYM(e.target.value) ? e.target.value : null)}
            className="glass-field px-2 py-0.5 text-xs"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1">
        <ShockProjectionChart p={p} animate={!reduced} fill />
      </div>
      <p className="mt-1 text-[11px] text-muted">Hypothetical projection from the Dec 2025 data and the shock assumptions, not a forecast of real events.</p>
    </div>
  );
}
