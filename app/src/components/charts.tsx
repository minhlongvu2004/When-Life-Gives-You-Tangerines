"use client";

import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthRow } from "@/lib/data";
import { money } from "@/lib/engine";
import type { Projection } from "@/lib/shocks";
import { LegendKey } from "./ui";

export const compact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}K` : a >= 1e3 ? `${+(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`;
  return (v < 0 ? "−$" : "$") + s;
};
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mo - 1]} ${y.slice(2)}`;
};

const axis = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;

function TipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <span className="tnum ml-auto pl-4 font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function InOutChart({ rows }: { rows: MonthRow[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Money in vs money out, by month</div>
        <div className="flex gap-3">
          <LegendKey color="var(--series-1)" label="Money in" />
          <LegendKey color="var(--series-2)" label="Money out" />
        </div>
      </div>
      <div className="h-40">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} minTickGap={28} />
            <YAxis tickFormatter={compact} {...axis} axisLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox
                    title={monthLabel(String(label))}
                    rows={[
                      { color: "var(--series-1)", label: "Money in", value: money(Number(payload[0]?.payload.money_in)) },
                      { color: "var(--series-2)", label: "Money out", value: money(Number(payload[0]?.payload.money_out)) },
                    ]}
                  />
                ) : null
              }
            />
            <Line
              type="monotone"
              dataKey="money_in"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
            <Line
              type="monotone"
              dataKey="money_out"
              stroke="var(--series-2)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BalanceChart({ rows, buffer }: { rows: MonthRow[]; buffer: number }) {
  const last6 = rows.slice(-6);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Savings over time</div>
        <span className="text-xs text-muted">dashed = savings B ({money(buffer)}, last 6 mo)</span>
      </div>
      <div className="h-40">
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} minTickGap={28} />
            <YAxis tickFormatter={compact} {...axis} axisLine={false} width={52} />
            {last6.length > 0 && <ReferenceArea x1={last6[0].month} x2={last6[last6.length - 1].month} fill="var(--accent)" fillOpacity={0.08} stroke="none" />}
            <ReferenceLine y={buffer} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth={1.5} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox
                    title={monthLabel(String(label))}
                    rows={[
                      { color: "var(--series-1)", label: "Avg daily balance", value: money(Number(payload[0]?.payload.avg_daily_balance)) },
                      { label: "Month-end balance", value: money(Number(payload[0]?.payload.month_end_balance)) },
                      { label: "Days below zero", value: String(payload[0]?.payload.days_below_zero) },
                    ]}
                  />
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="avg_daily_balance"
              stroke="var(--series-1)"
              strokeWidth={2}
              fill="url(#balFill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function DepletionChart({
  data,
  duration,
  runway,
  withPlan,
  hasShock,
}: {
  data: { month: number; balance: number; baseline: number; plan?: number }[];
  duration: number;
  runway: number | null;
  withPlan: boolean;
  hasShock: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Savings buffer, month by month</div>
        <div className="flex flex-wrap gap-3">
          <LegendKey color="var(--series-1)" label="No shock" />
          {hasShock && <LegendKey color="var(--series-2)" label="With shock" />}
          {withPlan && <LegendKey color="var(--good)" label="Shock + backup plan" />}
        </div>
      </div>
      <div className="h-60">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            {hasShock && <ReferenceArea x1={0} x2={Math.min(duration, data.length - 1)} fill="var(--series-2)" fillOpacity={0.06} stroke="none" />}
            <XAxis dataKey="month" {...axis} tickFormatter={(m) => (m === 0 ? "Now" : `M${m}`)} interval="preserveStartEnd" minTickGap={14} />
            <YAxis tickFormatter={compact} {...axis} axisLine={false} width={56} />
            <ReferenceLine
              y={0}
              stroke="var(--critical)"
              strokeWidth={1.5}
              label={{ value: "Broke", position: "insideBottomLeft", fill: "var(--critical-text)", fontSize: 11 }}
            />
            {hasShock && runway !== null && runway > 0 && runway <= data.length - 1 && (
              <ReferenceLine
                x={Math.round(runway)}
                stroke="var(--series-2)"
                strokeDasharray="3 3"
                label={{ value: `runs out ≈ M${runway}`, position: "top", fill: "var(--ink-2)", fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox
                    title={Number(label) === 0 ? "Now (after one-off costs)" : `Month ${label}${Number(label) <= duration ? " · shock" : " · after shock"}`}
                    rows={[
                      { color: "var(--series-1)", label: "No shock", value: money(Number(payload[0]?.payload.baseline)) },
                      { color: "var(--series-2)", label: "With shock", value: money(Number(payload[0]?.payload.balance)) },
                      ...(withPlan ? [{ color: "var(--good)", label: "With backup plan", value: money(Number(payload[0]?.payload.plan)) }] : []),
                    ]}
                  />
                ) : null
              }
            />
            <Line type="monotone" dataKey="baseline" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            {withPlan && <Line type="monotone" dataKey="plan" stroke="var(--good)" strokeWidth={2} dot={false} isAnimationActive={false} />}
            {hasShock && (
              <Line
                type="monotone"
                dataKey="balance"
                stroke="var(--series-2)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-xs text-muted">
        {hasShock
          ? `Shaded = shock period (${duration} months). After it ends, the usual pattern resumes and backup-plan cuts stop.`
          : "Apply a shock to see how fast the buffer drains."}
      </div>
    </div>
  );
}

const shortMonth = (label: string) => {
  const [mon, y] = label.split(" ");
  return y ? `${mon} ${y.slice(2)}` : label;
};

/** Duration-aware savings projection: shock months shaded, shock end marked, zero line, run-out point. */
export function ShockProjectionChart({ p, animate = true, fill }: { p: Projection; animate?: boolean; fill?: boolean }) {
  const data = p.points;
  const H = p.horizon;
  const end = Math.min(p.duration, H);
  const ticks = data.filter((d) => d.t === 0 || d.t % (H > 24 ? 6 : 3) === 0 || d.t === end).map((d) => d.t);
  // the gradient spans the shaded area's own box (balance down to zero), so split it where zero falls
  const bHi = Math.max(0, ...data.map((d) => d.balance));
  const bLo = Math.min(0, ...data.map((d) => d.balance));
  const zeroAt = bHi === bLo ? 1 : bHi / (bHi - bLo);
  return (
    <div className={fill ? "flex h-full min-h-0 flex-col" : ""}>
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendKey color="var(--series-2)" label="With this shock" />
        <LegendKey color="var(--series-1)" label="No shock" dashed />
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <span className="h-2.5 w-4 rounded-sm bg-accent/15" aria-hidden /> Shock period
        </span>
      </div>
      <div className={fill ? "min-h-[180px] flex-1" : "h-64 sm:h-72"}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 24, right: 14, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-2)" stopOpacity={0.28} />
                <stop offset={`${zeroAt * 100}%`} stopColor="var(--series-2)" stopOpacity={0.04} />
                <stop offset={`${zeroAt * 100}%`} stopColor="var(--critical)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="var(--critical)" stopOpacity={0.28} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <ReferenceArea x1={0} x2={end} fill="var(--accent)" fillOpacity={0.07} stroke="none" ifOverflow="extendDomain" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, H]}
              ticks={ticks}
              tickFormatter={(t: number) => (t === 0 ? "Start" : shortMonth(data[t]?.label ?? ""))}
              {...axis}
            />
            <YAxis tickFormatter={compact} {...axis} axisLine={false} width={56} domain={["auto", "auto"]} />
            <ReferenceLine
              y={0}
              ifOverflow="extendDomain"
              stroke="var(--critical)"
              strokeWidth={1.5}
              label={{ value: "Savings gone", position: "insideBottomLeft", fill: "var(--critical-text)", fontSize: 11 }}
            />
            {p.duration < H && (
              <ReferenceLine
                x={end}
                stroke="var(--accent)"
                strokeDasharray="4 4"
                label={{ value: `Shock ends · ${shortMonth(data[end].label)}`, position: "top", fill: "var(--ink-2)", fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload }) => {
                const d = active && payload?.length ? (payload[0]?.payload as Projection["points"][number]) : null;
                if (!d) return null;
                return (
                  <TipBox
                    title={d.t === 0 ? `${d.label} (after one-off costs)` : `${d.label} · ${d.phase === "shock" ? `shock month ${d.t}` : "after the shock"}`}
                    rows={[
                      { color: "var(--series-2)", label: "With this shock", value: money(d.balance) },
                      { color: "var(--series-1)", label: "No shock", value: money(d.baseline) },
                      { label: "Difference", value: money(d.balance - d.baseline) },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="linear"
              dataKey="baseline"
              stroke="var(--series-1)"
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={animate}
              animationDuration={500}
            />
            <Area
              type="linear"
              dataKey="balance"
              stroke="var(--series-2)"
              strokeWidth={2.5}
              fill="url(#projFill)"
              baseValue={0}
              isAnimationActive={animate}
              animationDuration={500}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--surface)" }}
            />
            {p.exhaustedAt !== null && p.exhaustedAt <= H && (
              <ReferenceDot
                x={p.exhaustedAt}
                y={0}
                r={5.5}
                fill="var(--critical)"
                stroke="var(--surface)"
                strokeWidth={2}
                label={{ value: "Runs out", position: "top", fill: "var(--critical-text)", fontSize: 11, fontWeight: 600 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
