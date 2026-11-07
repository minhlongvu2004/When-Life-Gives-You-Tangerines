"use client";

import { motion } from "framer-motion";
import { PiggyBank, ShieldAlert, Flag, ArrowRight } from "lucide-react";
import { useState } from "react";
import { backupPlan, formatRunway, goalPlan, money, type Metrics, type Mode, type Shock } from "@/lib/engine";
import { Card, SectionTitle, Segmented, StatusBadge } from "./ui";
import { shockLabel } from "./Shock";

export function PlanSection({ m, mode, shock }: { m: Metrics; mode: Mode; shock: Shock }) {
  const [share, setShare] = useState<"0.25" | "0.5" | "0.75">("0.5");
  const g = goalPlan(m, mode, Number(share));
  const steps = backupPlan(m, shock, mode);
  const final = steps[steps.length - 1];
  const progress = g.target > 0 ? Math.max(0, Math.min(1, g.current / g.target)) : 1;
  const hasShock = shockLabel(shock) !== "no shock";
  const finalOk = final.runway === null || final.runway >= shock.durationMonths;

  return (
    <section>
      <SectionTitle step="3" title="Make a plan" sub="Two plans built from this customer's own numbers: one to get ready, one for the day the shock hits." />
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Goal plan */}
        <Card>
          <div className="flex items-center gap-2">
            <PiggyBank className="size-5 text-accent" aria-hidden />
            <h3 className="text-base font-semibold">Goal plan: build an emergency fund</h3>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            Target <b className="tnum text-ink">{money(g.target)}</b>, {g.targetReason}.
          </p>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-ink-2">
              <span>
                Today <b className="tnum text-ink">{money(g.current)}</b>
              </span>
              <span>{Math.round(progress * 100)}% of goal</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-accent-soft">
              <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          </div>

          {g.shortfall === 0 ? (
            <div className="mt-4">
              <StatusBadge kind="good">Already fully funded</StatusBadge>
              <p className="mt-2 text-sm text-ink-2">
                Keep {money(g.target)} parked in a high-interest savings account. Anything above it ({money(g.current - g.target)}) can go to longer-term goals.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink-2">Share of monthly surplus to save</span>
                <Segmented
                  size="sm"
                  value={share}
                  onChange={setShare}
                  options={[
                    { value: "0.25", label: "25%" },
                    { value: "0.5", label: "50%" },
                    { value: "0.75", label: "75%" },
                  ]}
                />
              </div>
              {g.cutNeeded > 0 && (
                <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-sm">
                  Spends <b className="tnum">{money(-g.surplus)}</b>/mo more than comes in. Trimming flexible spending by{" "}
                  <b>{Math.round(g.cutNeeded * 100)}%</b> ({money(g.cutNeeded * m.disc)}/mo) closes the gap and frees{" "}
                  <b className="tnum">{money(g.monthly)}</b>/mo to save.
                </p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Mini label="Still needed" value={money(g.shortfall)} />
                <Mini label="Save each month" value={g.monthly > 0 ? money(g.monthly) : "—"} />
                <Mini label="Fully funded in" value={g.monthsToGoal === null ? "—" : `${g.monthsToGoal} mo`} />
              </div>
              <ol className="mt-4 space-y-2">
                {g.steps.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 text-sm">
                    <Flag className={`size-4 shrink-0 ${s.month === 0 ? "text-good" : "text-muted"}`} aria-hidden />
                    <span className="flex-1">
                      {s.label} <span className="tnum text-muted">({money(s.amount)})</span>
                    </span>
                    <span className="tnum font-medium">{s.month === 0 ? "✓ done" : s.month === null ? "—" : `month ${s.month}`}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">
                Tip: automate it. Schedule a transfer of {money(g.monthly)} the day after payday so it never feels like spending money.
              </p>
            </>
          )}
        </Card>

        {/* Backup plan */}
        <Card>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-accent" aria-hidden />
            <h3 className="text-base font-semibold">Backup plan: if the shock hits</h3>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {hasShock ? <>Scenario: {shockLabel(shock)}.</> : <>Apply a shock in step 2 to see how each move stretches the runway.</>}
          </p>
          {shock.jobLoss && (
            <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <b>Day 1:</b> apply for EI within 4 weeks of the last day of work (late claims can lose benefits). Every runway below already counts EI.
            </div>
          )}
          <ol className="mt-4 space-y-2">
            {steps.map((s, i) => (
              <motion.li
                key={s.label}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="truncate text-xs text-muted">{s.detail}</div>
                </div>
                <div className="text-right">
                  <div className="tnum text-sm font-semibold">{s.runway === null ? "120+" : `${formatRunway(s.runway)} mo`}</div>
                  {i > 0 && (
                    <div className="tnum text-xs text-good-text">
                      {s.gained === null ? "no shortfall" : s.gained > 0 ? `+${s.gained.toFixed(1)} mo` : "±0"}
                    </div>
                  )}
                </div>
              </motion.li>
            ))}
          </ol>
          {hasShock && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-2">With the full plan:</span>
              {finalOk ? (
                <StatusBadge kind="good">Makes it through {shock.durationMonths} months</StatusBadge>
              ) : (
                <StatusBadge kind="critical">Still runs out at {formatRunway(final.runway)} months</StatusBadge>
              )}
            </div>
          )}
          {hasShock && !finalOk && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-2">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Cutting spending alone isn&apos;t enough here. The fix is the goal plan on the left: a bigger buffer before the shock arrives.
            </p>
          )}
        </Card>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="tnum mt-0.5 text-base font-semibold">{value}</div>
    </div>
  );
}
