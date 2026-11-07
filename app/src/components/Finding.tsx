"use client";

import { motion } from "framer-motion";
import { ArrowRight, Table2, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadFindings, usePromise, type Findings, type GroupStat } from "@/lib/data";
import { money } from "@/lib/engine";
import { compact } from "./charts";
import { Card, LegendKey, Segmented } from "./ui";

const axis = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;
const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

function Tip({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          {r.label}
          <span className="tnum ml-auto pl-4 font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Finding() {
  const f = usePromise(loadFindings, []);
  const [who, setWho] = useState<"all" | "workers">("all");
  const [view, setView] = useState<"chart" | "table">("chart");
  if (!f) return <div className="mt-10 h-96 animate-pulse rounded-2xl bg-surface" />;

  const tenths = (who === "all" ? f.byTenth : f.byTenthWorkers).map((g, i) => ({ ...g, label: `${i + 1}`, inc: compact(g.medianIncome) }));
  const lo = f.byFifth[0];
  const hi = f.byFifth[4];

  return (
    <div className="space-y-8 pt-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-xs font-medium tracking-wide text-accent-ink uppercase">Our biggest finding · {f.nAccounts.toLocaleString()} real accounts, {f.nTransactions.toLocaleString()} transactions</div>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">The more you earn, the fewer months you can survive.</h1>
        <p className="mt-3 max-w-2xl text-base text-ink-2">
          Savings don&apos;t grow as fast as lifestyles do. High earners spend almost everything they make, so their bank buffer covers far fewer
          months of their own spending. When the job goes, that thin buffer runs out first.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big value={`${hi.bufferMonths.toFixed(1)} mo`} label="of spending saved by the top-earning fifth" />
        <Big value={`${lo.bufferMonths.toFixed(1)} mo`} label="saved by the lowest-earning fifth" />
        <Big value={pctFmt(hi.failJudge)} label="of top earners can't last 6 months of EI (judges' 55% rule)" accent />
        <Big value={pctFmt(hi.failReal)} label="with the real 2026 EI cap of $729/week" accent />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            size="sm"
            value={who}
            onChange={setWho}
            options={[
              { value: "all", label: "All customers" },
              { value: "workers", label: `Excluding ${f.nPensioners} pensioners` },
            ]}
          />
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: <span className="flex items-center gap-1"><BarChart3 className="size-3.5" /> Chart</span> },
              { value: "table", label: <span className="flex items-center gap-1"><Table2 className="size-3.5" /> Table</span> },
            ]}
          />
        </div>

        {view === "chart" ? (
          <div className="mt-5 grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="text-base font-semibold">Buffer, in months of their own spending</h3>
              <p className="text-xs text-muted">Median per income tenth (1 = lowest income, 10 = highest)</p>
              <div className="mt-3 h-72">
                <ResponsiveContainer>
                  <BarChart data={tenths} margin={{ top: 20, right: 4, bottom: 18, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="label" {...axis} label={{ value: "Income tenth →", position: "insideBottom", offset: -12, fill: "var(--muted)", fontSize: 11 }} />
                    <YAxis {...axis} axisLine={false} width={32} />
                    <Tooltip
                      cursor={{ fill: "var(--surface-2)" }}
                      content={({ active, payload }) => {
                        const g = payload?.[0]?.payload as (GroupStat & { label: string }) | undefined;
                        return active && g ? (
                          <Tip
                            title={`Income tenth ${g.label}`}
                            rows={[
                              { label: "Typical income", value: money(g.medianIncome) + "/mo" },
                              { label: "Typical spending", value: money(g.medianSpending) + "/mo" },
                              { label: "Typical buffer", value: money(g.medianBuffer) },
                              { color: "var(--series-1)", label: "Months of spending", value: g.bufferMonths.toFixed(1) },
                            ]}
                          />
                        ) : null;
                      }}
                    />
                    <Bar dataKey="bufferMonths" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24}>
                      <LabelList dataKey="bufferMonths" position="top" formatter={(v: number) => v.toFixed(1)} style={{ fill: "var(--ink-2)", fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold">Can&apos;t last 6 months after a job loss</h3>
              <div className="mt-0.5 flex flex-wrap gap-3">
                <LegendKey color="var(--series-1)" label="Judges' rule (55% of all income)" />
                <LegendKey color="var(--series-2)" label="Real EI (55%, max $729/week)" />
              </div>
              <div className="mt-3 h-72">
                <ResponsiveContainer>
                  <BarChart data={tenths} margin={{ top: 20, right: 4, bottom: 18, left: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="label" {...axis} label={{ value: "Income tenth →", position: "insideBottom", offset: -12, fill: "var(--muted)", fontSize: 11 }} />
                    <YAxis {...axis} axisLine={false} width={40} tickFormatter={pctFmt} domain={[0, 1]} />
                    <Tooltip
                      cursor={{ fill: "var(--surface-2)" }}
                      content={({ active, payload }) => {
                        const g = payload?.[0]?.payload as (GroupStat & { label: string }) | undefined;
                        return active && g ? (
                          <Tip
                            title={`Income tenth ${g.label} · ${money(g.medianIncome)}/mo`}
                            rows={[
                              { color: "var(--series-1)", label: "Judges' rule", value: pctFmt(g.failJudge) },
                              { color: "var(--series-2)", label: "Real EI cap", value: pctFmt(g.failReal) },
                            ]}
                          />
                        ) : null;
                      }}
                    />
                    <Bar dataKey="failJudge" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="failReal" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={14}>
                      <LabelList dataKey="failReal" content={(p) => (p.index === tenths.length - 1 ? <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 6} textAnchor="middle" fontSize={11} fill="var(--ink-2)">{pctFmt(Number(p.value))}</text> : null)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <FindingTable rows={tenths} />
        )}
        <p className="mt-4 text-sm text-ink-2">
          {who === "all" ? (
            <>The low-income tenths include many pensioners, whose income doesn&apos;t stop with a job loss. Switch to <b>Excluding pensioners</b>: the pattern holds among working-age customers.</>
          ) : (
            <>Among working customers only, buffers still shrink from {f.byFifthWorkers[0].bufferMonths.toFixed(1)} to {f.byFifthWorkers[4].bufferMonths.toFixed(1)} months as income rises.</>
          )}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold">Why the judges&apos; rule flatters high earners</h3>
          <p className="mt-2 text-sm text-ink-2">
            The brief models a job loss as income × 55%. Real EI pays 55% of insurable earnings <b className="text-ink">up to $729 a week</b>, about{" "}
            {money(f.eiMonthlyCap)} a month in 2026. Someone with a typical {money(hi.medianIncome)} month gets {money(f.eiMonthlyCap)} from EI, not{" "}
            {money(hi.medianIncome * 0.55)}. Across all customers, the share who can&apos;t last 6 months jumps from{" "}
            <b className="text-ink">{pctFmt(f.allFailJudge)}</b> to <b className="text-ink">{pctFmt(f.allFailReal)}</b>.
          </p>
          <p className="mt-2 text-sm text-ink-2">Our engine shows both numbers side by side: the judges&apos; definition and the realistic one.</p>
        </Card>
        <Card>
          <h3 className="text-base font-semibold">Early warning: bumpy income before a loan</h3>
          <p className="mt-1 text-xs text-muted">
            {f.preLoan.n} loans · only months <i>before</i> each loan started · default = not repaid or in debt
          </p>
          <div className="mt-3 h-44">
            <ResponsiveContainer>
              <BarChart data={f.preLoan.volatility} margin={{ top: 18, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="group" {...axis} />
                <YAxis {...axis} axisLine={false} width={36} tickFormatter={pctFmt} />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={({ active, payload }) => {
                    const g = payload?.[0]?.payload as Findings["preLoan"]["volatility"][number] | undefined;
                    return active && g ? (
                      <Tip title={`${g.group} income (${g.n} loans)`} rows={[{ color: "var(--series-2)", label: "Later defaulted", value: pctFmt(g.defaultRate) }]} />
                    ) : null;
                  }}
                />
                <Bar dataKey="defaultRate" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={24}>
                  <LabelList dataKey="defaultRate" position="top" formatter={pctFmt} style={{ fill: "var(--ink-2)", fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-ink-2">
            Customers whose income swung the most before borrowing defaulted <b className="text-ink">{(f.preLoan.volatility[3].defaultRate / f.preLoan.volatility[0].defaultRate).toFixed(0)}×</b> as often
            as the steadiest ({pctFmt(f.preLoan.volatility[3].defaultRate)} vs {pctFmt(f.preLoan.volatility[0].defaultRate)}). That&apos;s why the plan
            treats a buffer as protection against bumpy months, not just job loss.
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-semibold">How the brief&apos;s example twists hit the whole bank</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { k: "jobLoss", label: "Laid off, EI 55%" },
            { k: "furnace", label: "Furnace = 1 month of spending" },
            { k: "jobLossBills", label: "Laid off + bills +15%" },
          ].map((t) => (
            <div key={t.k} className="rounded-xl bg-surface-2 p-4">
              <div className="text-sm text-ink-2">{t.label}</div>
              <div className="mt-1 text-3xl font-semibold">{pctFmt(f.twists[t.k].under6)}</div>
              <div className="text-xs text-muted">of customers run out within 6 months · {pctFmt(f.twists[t.k].under3)} within 3</div>
            </div>
          ))}
        </div>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline">
          Try it on any customer <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Card>
    </div>
  );
}

function Big({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? "bg-accent-soft" : "bg-surface"} border border-line`}>
      <div className="text-3xl font-semibold tracking-tight sm:text-4xl">{value}</div>
      <div className="mt-1 text-sm text-ink-2">{label}</div>
    </div>
  );
}

function FindingTable({ rows }: { rows: (GroupStat & { label: string })[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="tnum w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 font-medium">Income tenth</th>
            <th className="font-medium">Customers</th>
            <th className="font-medium">Typical income</th>
            <th className="font-medium">Typical spending</th>
            <th className="font-medium">Typical buffer</th>
            <th className="font-medium">Months saved</th>
            <th className="font-medium">Fail 6 mo (judge)</th>
            <th className="font-medium">Fail 6 mo (real EI)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line/60">
              <td className="py-1.5">{r.label}</td>
              <td>{r.n}</td>
              <td>{money(r.medianIncome)}</td>
              <td>{money(r.medianSpending)}</td>
              <td>{money(r.medianBuffer)}</td>
              <td>{r.bufferMonths.toFixed(1)}</td>
              <td>{pctFmt(r.failJudge)}</td>
              <td>{pctFmt(r.failReal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
