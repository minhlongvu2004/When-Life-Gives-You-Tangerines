"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, ChevronDown, CloudLightning, Flame, Home, RotateCcw, Sparkles, Wand2, Zap, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EI_MONTHLY_CAP,
  formatRunway,
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
import { DepletionChart } from "./charts";
import { AnimatedNumber, Card, SectionTitle, Slider, StatusBadge, Toggle } from "./ui";

export const PRESETS: { key: string; label: string; Icon: LucideIcon; shock: Shock }[] = [
  { key: "job", label: "Laid off · EI 55% for 6 mo", Icon: Briefcase, shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, durationMonths: 6 } },
  { key: "furnace", label: "Furnace dies · 1 month of spending", Icon: Flame, shock: { ...NO_SHOCK, oneOffMult: 1 } },
  { key: "combo", label: "Laid off + bills +15%", Icon: CloudLightning, shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, billsPct: 0.15, durationMonths: 6 } },
  { key: "rent", label: "Rent & bills +15%", Icon: Home, shock: { ...NO_SHOCK, billsPct: 0.15, durationMonths: 12 } },
  { key: "perfect", label: "Perfect storm", Icon: Zap, shock: { ...NO_SHOCK, jobLoss: true, incomePct: 0.55, billsPct: 0.15, oneOffMult: 1, durationMonths: 6 } },
];

export function shockLabel(s: Shock): string {
  const parts: string[] = [];
  if (s.jobLoss) parts.push(`job loss (income ${pct(s.incomePct)})`);
  else if (s.incomePct !== 1) parts.push(`income ${pct(s.incomePct)} of usual`);
  if (s.billsPct) parts.push(`bills +${pct(s.billsPct)}`);
  if (s.extraMonthly) parts.push(`+${money(s.extraMonthly)}/mo`);
  if (s.oneOffMult) parts.push(`one-off ${s.oneOffMult}× monthly spending`);
  if (s.oneOffAbs) parts.push(`one-off ${money(s.oneOffAbs)}`);
  return parts.length ? parts.join(" + ") : "no shock";
}

export function ShockSection({
  m,
  mode,
  shock,
  setShock,
  all,
  planScenario,
  path,
}: {
  m: Metrics;
  mode: Mode;
  shock: Shock;
  setShock: (s: Shock) => void;
  all: Metrics[];
  planScenario: Scenario;
  path: { month: number; balance: number; baseline: number; plan?: number }[];
}) {
  const [twistText, setTwistText] = useState("");
  const [understood, setUnderstood] = useState<string[]>([]);
  const [showMath, setShowMath] = useState(true);

  const base = scenario(m, NO_SHOCK, mode);
  const sc = scenario(m, shock, mode);
  const other = scenario(m, shock, mode === "judge" ? "realistic" : "judge");
  const v = verdict(sc, shock.durationMonths);
  const hasShock = shockLabel(shock) !== "no shock";

  // how does this twist land across the whole bank?
  const population = useMemo(() => {
    let fail = 0;
    let worse = 0;
    for (const x of all) {
      const r = scenario(x, shock, mode).runway;
      const rr = r === null ? Infinity : r;
      if (rr < shock.durationMonths) fail++;
      if (rr < (sc.runway === null ? Infinity : sc.runway)) worse++;
    }
    return { fail: fail / all.length, rank: worse / all.length };
  }, [all, shock, mode, sc.runway]);

  const applyTwist = () => {
    const p = parseTwist(twistText);
    setUnderstood(p.understood.length ? p.understood : ["Couldn't read that twist; use the sliders below."]);
    if (p.understood.length) setShock(p.shock);
  };

  const set = (patch: Partial<Shock>) => setShock({ ...shock, ...patch });
  const runwayText = (r: number | null) => (r === null ? "120+" : formatRunway(r));

  return (
    <section>
      <SectionTitle step="2" title="Take a shock" sub="Pick a twist, read a twist card, or drag the sliders. Everything recalculates instantly." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Controls */}
        <Card className="space-y-5">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium" htmlFor="twist">
              <Wand2 className="size-4 text-accent" aria-hidden /> Read a twist card
            </label>
            <div className="flex gap-2">
              <input
                id="twist"
                value={twistText}
                onChange={(e) => setTwistText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyTwist()}
                placeholder="“They lose their job (EI at 55%) and household bills go up 15%”"
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
              <button onClick={applyTwist} className="rounded-xl bg-ink px-4 text-sm font-medium text-page hover:opacity-90">
                Apply
              </button>
            </div>
            <AnimatePresence>
              {understood.length > 0 && (
                <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 space-y-0.5 text-xs text-ink-2">
                  {understood.map((u) => (
                    <li key={u} className="flex items-center gap-1.5">
                      <Sparkles className="size-3 text-accent" aria-hidden /> {u}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Quick twists</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = JSON.stringify(p.shock) === JSON.stringify(shock);
                return (
                  <button
                    key={p.key}
                    onClick={() => setShock(p.shock)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-accent hover:text-ink"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <p.Icon className="size-3.5" aria-hidden /> {p.label}
                    </span>
                  </button>
                );
              })}
              <button onClick={() => setShock(NO_SHOCK)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted hover:text-ink">
                <RotateCcw className="size-3" aria-hidden /> Reset
              </button>
            </div>
          </div>

          <div className="space-y-4 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <Toggle
                checked={shock.jobLoss}
                onChange={(on) => set(on ? { jobLoss: true, incomePct: shock.incomePct === 1 ? 0.55 : shock.incomePct } : { jobLoss: false, incomePct: 1 })}
                label="Job loss (income replaced by EI)"
              />
            </div>
            <Slider
              label={shock.jobLoss ? "EI pays (share of usual income)" : "Income after shock"}
              value={shock.incomePct}
              min={0}
              max={1}
              step={0.05}
              onChange={(x) => set({ incomePct: x })}
              display={`${Math.round(shock.incomePct * 100)}%  ·  ${money(sc.income)}/mo`}
            />
            <Slider
              label="Household bills / rent increase"
              value={shock.billsPct}
              min={0}
              max={0.5}
              step={0.01}
              onChange={(x) => set({ billsPct: x })}
              display={`+${Math.round(shock.billsPct * 100)}%  ·  +${money(shock.billsPct * m.H)}/mo`}
            />
            <Slider
              label="Other extra monthly cost"
              value={shock.extraMonthly}
              min={0}
              max={3000}
              step={50}
              onChange={(x) => set({ extraMonthly: x })}
              display={`+${money(shock.extraMonthly)}/mo`}
            />
            <Slider
              label="Surprise one-off cost (months of spending)"
              value={shock.oneOffMult}
              min={0}
              max={3}
              step={0.25}
              onChange={(x) => set({ oneOffMult: x })}
              display={`${shock.oneOffMult}×  ·  ${money(shock.oneOffMult * m.S)}`}
            />
            <Slider
              label="Surprise one-off cost ($)"
              value={shock.oneOffAbs}
              min={0}
              max={20000}
              step={250}
              onChange={(x) => set({ oneOffAbs: x })}
              display={money(shock.oneOffAbs)}
            />
            <Slider
              label="How long the shock lasts"
              value={shock.durationMonths}
              min={1}
              max={24}
              step={1}
              onChange={(x) => set({ durationMonths: x })}
              display={`${shock.durationMonths} months`}
              hint="Used for the “do they make it?” verdict and the chart. The runway formula itself doesn't depend on it."
            />
          </div>
        </Card>

        {/* Results */}
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-ink-2">Runway</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-2xl font-semibold text-muted line-through decoration-1">{hasShock && base.runway !== sc.runway ? runwayText(base.runway) : ""}</span>
                <span className="text-6xl font-semibold tracking-tight">
                  {sc.runway === null ? "120+" : <AnimatedNumber value={sc.runway} format={(x) => x.toFixed(1)} />}
                </span>
                <span className="text-lg text-ink-2">months</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {sc.runway === null ? "No shortfall (120+): income still covers spending." : `${hasShock ? "After: " + shockLabel(shock) : "No shock applied"}`}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {hasShock && (
                v.survives ? (
                  <StatusBadge kind="good">Makes it through {shock.durationMonths} months</StatusBadge>
                ) : (
                  <StatusBadge kind="critical">Runs out {v.monthsShort.toFixed(1)} months early</StatusBadge>
                )
              )}
              <div className="text-right text-xs text-ink-2">
                {hasShock && v.survives && sc.runway !== null && <>Buffer left after {shock.durationMonths} mo: <b className="tnum text-ink">{money(v.spare)}</b></>}
                {hasShock && !v.survives && <>Needs <b className="tnum text-ink">{money(v.moneyNeeded)}</b> more buffer to last</>}
              </div>
              <div className="rounded-lg bg-surface-2 px-2.5 py-1 text-right text-xs text-ink-2">
                {mode === "judge" ? "Realistic" : "Judge formula"}: <b className="tnum text-ink">{runwayText(other.runway)}</b> mo
              </div>
            </div>
          </div>

          {hasShock && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-surface-2 p-2.5">
                <div className="text-ink-2">Income</div>
                <div className="tnum mt-0.5 text-base font-semibold">{money(sc.income)}</div>
                <div className="text-muted">was {money(base.income)}</div>
              </div>
              <div className="rounded-xl bg-surface-2 p-2.5">
                <div className="text-ink-2">Spending</div>
                <div className="tnum mt-0.5 text-base font-semibold">{money(sc.spending)}</div>
                <div className="text-muted">was {money(base.spending)}</div>
              </div>
              <div className={`rounded-xl p-2.5 ${sc.gap > 0 ? "bg-critical-soft" : "bg-good-soft"}`}>
                <div className="text-ink-2">Monthly gap</div>
                <div className="tnum mt-0.5 text-base font-semibold">{sc.gap > 0 ? `−${money(sc.gap)}` : `+${money(-sc.gap)}`}</div>
                <div className="text-muted">{sc.gap > 0 ? "drawn from buffer" : "still saving"}</div>
              </div>
            </div>
          )}

          <DepletionChart data={path} duration={shock.durationMonths} runway={sc.runway} hasShock={hasShock} withPlan={hasShock && planScenario.runway !== sc.runway} />

          {hasShock && (
            <p className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-ink">
              Across all {all.length.toLocaleString()} customers, this twist leaves{" "}
              <b>{Math.round(population.fail * 100)}%</b> unable to last {shock.durationMonths} months. This customer has a longer runway than{" "}
              <b>{Math.round(population.rank * 100)}%</b> of them.
            </p>
          )}

          <div className="border-t border-line pt-3">
            <button onClick={() => setShowMath(!showMath)} className="flex w-full items-center justify-between text-sm font-medium">
              Show the math {mode === "judge" ? "(judges' definitions)" : "(realistic mode)"}
              <ChevronDown className={`size-4 transition-transform ${showMath ? "rotate-180" : ""}`} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {showMath && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <MathBlock m={m} sc={sc} mode={mode} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </section>
  );
}

function MathBlock({ m, sc, mode }: { m: Metrics; sc: Scenario; mode: Mode }) {
  const row = (k: string, formula: string, value: string, strong = false) => (
    <div className="grid grid-cols-[110px_1fr_auto] items-baseline gap-3 py-1">
      <span className="font-mono text-xs text-muted">{k}</span>
      <span className="font-mono text-xs text-ink-2">{formula}</span>
      <span className={`tnum text-right font-mono text-sm ${strong ? "font-semibold text-ink" : "text-ink"}`}>{value}</span>
    </div>
  );
  const r = sc.runway;
  return (
    <div className="mt-2 rounded-xl bg-surface-2 px-3.5 py-2.5">
      {row("buffer_left", `B − one-off = ${money(m.B)} − ${money(sc.oneOff)}`, money(sc.bufferLeft))}
      {row("income", sc.incomeNote.replace(/\bI\b/, `I (${money(m.I)})`), money(sc.income))}
      {row("spending", sc.spendingNote.replace(/^S\b/, `S (${money(m.S)})`).replace(/\bH\b/, `H (${money(m.H)})`), money(sc.spending))}
      {row("gap", "spending − income", money(sc.gap))}
      <div className="my-1 border-t border-line" />
      {row(
        "runway",
        sc.bufferLeft <= 0
          ? "buffer_left ≤ 0 → 0"
          : sc.gap <= 0
            ? "gap ≤ 0 → no shortfall (120+)"
            : `min(${money(sc.bufferLeft)} ÷ ${money(sc.gap)}, 120)`,
        r === null ? "no shortfall (120+)" : `${formatRunway(r)} months`,
        true,
      )}
      {mode === "realistic" && (
        <p className="mt-2 text-xs text-muted">
          Realistic mode: EI replaces 55% of earnings but never more than $729/week (≈ {money(EI_MONTHLY_CAP)}/mo, 2026 rules), and pension income
          keeps paying through a job loss. The judges&apos; formula applies 55% to all income with no cap.
        </p>
      )}
    </div>
  );
}
