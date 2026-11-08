"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import { money, scenario, type Metrics, type Mode, type Scenario, type Shock } from "@/lib/engine";
import { projectShock, ymLabel, type Projection } from "@/lib/shocks";
import { addMonths, parseYM, ymString, type YM } from "@/lib/whatif/scenarios";
import { ShockProjectionChart } from "../charts";
import { InfoTip } from "../InfoTip";

const months = (r: number | null) => (r === null ? "120+" : r.toFixed(1));
const mo = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

function story(m: Metrics, s: Shock, sc: Scenario, p: Projection, mode: Mode): string[] {
  const out: string[] = [];
  out.push(`Account #${m.id} usually brings in ${money(m.I)} and spends ${money(m.S)} a month, with ${money(m.B)} in savings (average daily balance over the last six months).`);
  out.push(
    `During the shock, income is ${money(sc.income)} and spending is ${money(sc.spending)} a month` +
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
        : `If that rate never ended, savings would last ${months(sc.runway)} months (the judged runway).`,
    );
  if (p.exhaustedAt === null) {
    out.push(
      p.afterGap >= 0
        ? `The shock ends after ${mo(s.durationMonths)} with ${money(p.balanceAtShockEnd)} left, then savings start rebuilding by about ${money(p.afterGap)} a month.`
        : `The shock ends after ${mo(s.durationMonths)} with ${money(p.balanceAtShockEnd)} left. Their usual spending is still ${money(-p.afterGap)} a month more than income, so savings keep shrinking slowly.`,
    );
  } else if (p.exhaustedAt > 0 && p.exhaustedMonth) {
    out.push(
      p.exhaustedDuringShock
        ? `Because this shock lasts ${mo(s.durationMonths)}, the projection runs out of savings in ${ymLabel(p.exhaustedMonth)}, month ${Math.ceil(p.exhaustedAt)} of the shock.`
        : `The shock ends after ${mo(s.durationMonths)}, but their usual spending is already more than their income, so savings still run out in ${ymLabel(p.exhaustedMonth)}.`,
    );
  }
  if (mode === "realistic") out.push("Income uses the realistic setting: the 2026 EI weekly maximum, with pensions still paid.");
  return out;
}

function Tile({ label, value, sub, tone, help }: { label: string; value: string; sub?: string; tone?: "good" | "critical"; help?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border px-3.5 py-3 ${tone === "critical" ? "border-critical/30 bg-critical-soft" : tone === "good" ? "border-good/30 bg-good-soft" : "border-glass-border bg-glass"}`}>
      <div className="flex items-center gap-1.5 text-xs text-ink-2">
        <span className="truncate">{label}</span>
        {help && <InfoTip label={label}>{help}</InfoTip>}
      </div>
      <motion.div
        key={value}
        initial={{ opacity: 0.35, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`tnum mt-1 truncate text-lg font-semibold tracking-tight ${tone === "critical" ? "text-critical-text" : tone === "good" ? "text-good-text" : ""}`}
      >
        {value}
      </motion.div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function ShockImpact({
  m,
  shock,
  mode,
  start,
  setStart,
  now,
}: {
  m: Metrics;
  shock: Shock;
  mode: Mode;
  start: string | null;
  setStart: (s: string | null) => void;
  now: YM;
}) {
  const reduced = !!useReducedMotion();
  const startYM = (start && parseYM(start)) || now;
  const sc = scenario(m, shock, mode);
  const p = projectShock(m, shock, mode, startYM);
  const endYM = addMonths(startYM, shock.durationMonths - 1);
  const short = sc.gap > 0;

  const runOut =
    p.exhaustedAt === null
      ? { value: "Doesn't run out", sub: `within ${mo(p.horizon)}` }
      : p.exhaustedAt === 0
        ? { value: ymLabel(startYM), sub: "the day the shock hits" }
        : { value: ymLabel(p.exhaustedMonth!), sub: p.exhaustedDuringShock ? `month ${Math.ceil(p.exhaustedAt)} of the shock` : "after the shock ends" };

  return (
    <section className="glass-card p-4 sm:p-6" aria-labelledby="impact-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="impact-title" className="text-base font-semibold">
            Financial impact
          </h2>
          <p className="text-sm text-ink-2">Built from this account&apos;s own monthly summaries. Shock values are the assumptions above.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <CalendarClock className="size-4 text-muted" aria-hidden />
          Shock starts
          <input
            type="month"
            value={ymString(startYM)}
            min={ymString(now)}
            onChange={(e) => setStart(e.target.value && parseYM(e.target.value) ? e.target.value : null)}
            className="glass-field px-2.5 py-1 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Tile
          label="Savings buffer"
          value={sc.oneOff > 0 ? `${money(m.B)} → ${money(sc.bufferLeft)}` : money(m.B)}
          sub={sc.oneOff > 0 ? `before → after ${money(sc.oneOff)} one-off` : "no one-off costs"}
          tone={sc.bufferLeft <= 0 ? "critical" : undefined}
        />
        <Tile label="Income after shock" value={`${money(sc.income)}/mo`} sub={`usually ${money(m.I)}`} />
        <Tile label="Spending after shock" value={`${money(sc.spending)}/mo`} sub={`usually ${money(m.S)}`} />
        <Tile
          label={short ? "Monthly shortfall" : "Monthly surplus"}
          value={`${short ? "−" : "+"}${money(Math.abs(sc.gap))}/mo`}
          sub="income − spending, during the shock"
          tone={short ? "critical" : "good"}
        />
        <Tile
          label="Judged runway"
          value={sc.runway === null ? "No shortfall (120+)" : `${months(sc.runway)} months`}
          sub="fixed rate · README formula"
          help="The datathon's runway: savings left after one-off costs ÷ monthly shortfall, capped at 120. It assumes the shock's monthly rate never ends, so it can differ from the projection below."
        />
        <Tile label="Shock lasts" value={mo(shock.durationMonths)} sub={`${ymLabel(startYM)} – ${ymLabel(endYM)}`} />
        <Tile label="Savings run out" value={runOut.value} sub={runOut.sub} tone={p.exhaustedAt === null ? "good" : "critical"} />
        <Tile
          label="Lowest balance"
          value={money(p.lowest.balance)}
          sub={p.lowest.t === 0 ? "right after one-off costs" : p.points[p.lowest.t].label}
          tone={p.lowest.balance < 0 ? "critical" : undefined}
        />
      </div>

      <div className="mt-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Duration-aware projection</h3>
          <InfoTip label="Duration-aware projection">
            One-off costs come out once at the start. The shock&apos;s monthly changes apply for {mo(shock.durationMonths)}, then this customer&apos;s usual income and
            spending come back. Use it alongside the judged runway, which assumes the shock never ends.
          </InfoTip>
        </div>
        <ShockProjectionChart p={p} animate={!reduced} />
      </div>

      <div className="mt-4 rounded-2xl bg-surface-2/70 px-4 py-3 text-sm leading-relaxed text-ink-2" aria-live="polite">
        {story(m, shock, sc, p, mode).join(" ")}
        <span className="mt-1 block text-xs text-muted">A projection from past account data and the assumptions above, not a forecast of real events.</span>
      </div>
    </section>
  );
}
