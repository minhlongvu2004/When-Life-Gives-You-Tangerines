"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadFindings, usePromise, type GroupStat } from "@/lib/data";
import { money } from "@/lib/engine";
import { SheetButton } from "./guided";
import { LegendKey, Segmented } from "./ui";

const axis = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false } as const;
const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

function Tip({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          {r.label}
          <span className="tnum ml-auto pl-4 font-semibold text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Finding() {
  const f = usePromise(loadFindings, []);
  const [view, setView] = useState<"saved" | "fail">("saved");
  if (!f) return <div className="mt-16 h-96 animate-pulse rounded-3xl bg-surface" />;

  const tenths = f.byTenthWorkers.map((g, i) => ({ ...g, label: `${i + 1}` }));
  const lo = f.byFifthWorkers[0];
  const hi = f.byFifthWorkers[4];

  return (
    <div className="flex flex-col justify-center gap-6 pb-2">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
        <div className="text-sm font-medium text-accent-ink">Our biggest finding</div>
        <h1 className="mx-auto mt-2 text-3xl font-semibold tracking-tighter sm:text-[2.4rem] sm:leading-tight">The more you earn, the fewer months you survive.</h1>
        <p className="mx-auto mt-2 max-w-3xl text-base text-ink-2">
          High earners spend almost everything they make. When the job goes, their savings run out first.
        </p>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
          <Contrast label="Lowest earners" income={lo.medianIncome} months={lo.bufferMonths} fail={lo.failJudge} />
          <Contrast label="Highest earners" income={hi.medianIncome} months={hi.bufferMonths} fail={hi.failJudge} accent />
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{view === "saved" ? "Months of spending they have saved" : "Can't last 6 months after a layoff"}</h2>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "saved", label: "Savings" },
                { value: "fail", label: "Layoff" },
              ]}
            />
          </div>
          {view === "fail" && (
            <div className="mt-2 flex flex-wrap gap-4">
              <LegendKey color="var(--series-1)" label="Judges' rule (55% of income)" />
              <LegendKey color="var(--series-2)" label="Real EI (capped at $729/week)" />
            </div>
          )}
          <div className="mt-2 h-56">
            <ResponsiveContainer>
              <BarChart data={tenths} margin={{ top: 22, right: 4, bottom: 22, left: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis
                  dataKey="label"
                  {...axis}
                  label={{ value: "Income: lowest → highest", position: "insideBottom", offset: -14, fill: "var(--muted)", fontSize: 12 }}
                />
                <YAxis
                  {...axis}
                  axisLine={false}
                  width={40}
                  tickFormatter={view === "fail" ? pctFmt : undefined}
                  domain={view === "fail" ? [0, 1] : undefined}
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={({ active, payload }) => {
                    const g = payload?.[0]?.payload as (GroupStat & { label: string }) | undefined;
                    return active && g ? (
                      <Tip
                        title={`Income tenth ${g.label} · ${money(g.medianIncome)}/mo`}
                        rows={
                          view === "saved"
                            ? [
                                { label: "Typical savings", value: money(g.medianBuffer) },
                                { color: "var(--series-1)", label: "Months of spending", value: g.bufferMonths.toFixed(1) },
                              ]
                            : [
                                { color: "var(--series-1)", label: "Judges' rule", value: pctFmt(g.failJudge) },
                                { color: "var(--series-2)", label: "Real EI cap", value: pctFmt(g.failReal) },
                              ]
                        }
                      />
                    ) : null;
                  }}
                />
                {view === "saved" ? (
                  <Bar dataKey="bufferMonths" fill="var(--series-1)" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={700}>
                    <LabelList dataKey="bufferMonths" position="top" formatter={(v: number) => v.toFixed(1)} style={{ fill: "var(--ink-2)", fontSize: 12 }} />
                  </Bar>
                ) : (
                  [
                    <Bar key="j" dataKey="failJudge" fill="var(--series-1)" radius={[6, 6, 0, 0]} maxBarSize={18} animationDuration={700} />,
                    <Bar key="r" dataKey="failReal" fill="var(--series-2)" radius={[6, 6, 0, 0]} maxBarSize={18} animationDuration={700}>
                      <LabelList
                        dataKey="failReal"
                        content={(p) =>
                          p.index === tenths.length - 1 ? (
                            <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 6} textAnchor="middle" fontSize={12} fill="var(--ink-2)">
                              {pctFmt(Number(p.value))}
                            </text>
                          ) : null
                        }
                      />
                    </Bar>,
                  ]
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-sm text-ink-2">
            {view === "saved"
              ? `Savings fall from ${tenths[0].bufferMonths.toFixed(1)} months to ${tenths[9].bufferMonths.toFixed(1)} as income rises.`
              : `With the real EI cap, ${pctFmt(tenths[9].failReal)} of the top earners run out within 6 months.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="btn btn-primary gap-2 rounded-full px-6 py-3 text-sm"
        >
          Test it on any customer <ArrowRight className="size-4" aria-hidden />
        </Link>
        <SheetButton label="More from the data" title="More from the data">
          <div className="space-y-6 text-ink-2">
            <div>
              <h3 className="font-semibold text-ink">The judges&apos; rule is generous to high earners</h3>
              <p className="mt-1">
                Real EI pays 55% only up to $729 a week (≈ {money(f.eiMonthlyCap)}/mo in 2026). Across all customers, the share who can&apos;t last 6 months
                rises from <b className="text-ink">{pctFmt(f.allFailJudge)}</b> to <b className="text-ink">{pctFmt(f.allFailReal)}</b> once the cap applies.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-ink">Early warning: bumpy income before a loan</h3>
              <p className="mt-1">
                Using only months before each of {f.preLoan.n} loans started, customers with the most volatile income defaulted{" "}
                <b className="text-ink">{pctFmt(f.preLoan.volatility[3].defaultRate)}</b> of the time, against{" "}
                <b className="text-ink">{pctFmt(f.preLoan.volatility[0].defaultRate)}</b> for the steadiest (AUC {f.preLoan.volatilityAUC}).
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-ink">Pensioners excluded on purpose</h3>
              <p className="mt-1">
                {f.nPensioners} pensioners sit mostly in the low-income groups, and a layoff doesn&apos;t stop a pension. With them included, the trend is the
                same.
              </p>
            </div>
          </div>
        </SheetButton>
      </div>
    </div>
  );
}

function Contrast({ label, income, months, fail, accent }: { label: string; income: number; months: number; fail: number; accent?: boolean }) {
  return (
    <div className={`rounded-3xl border p-4 text-center ${accent ? "border-accent/40 bg-accent-soft" : "border-line bg-surface"}`}>
      <div className="text-sm font-medium text-ink-2">{label}</div>
      <div className="text-xs text-muted">earn ≈ {money(income)}/mo</div>
      <div className="tnum mt-1 text-4xl font-semibold tracking-tighter">{months.toFixed(1)}</div>
      <div className="text-sm text-ink-2">months of savings</div>
      <div className="mt-3 text-sm">
        <b className="tnum">{pctFmt(fail)}</b> <span className="text-ink-2">can&apos;t survive a 6-month layoff</span>
      </div>
    </div>
  );
}
