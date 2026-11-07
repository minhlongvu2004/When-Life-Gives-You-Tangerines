"use client";

import { motion } from "framer-motion";
import { User, MapPin, CreditCard, Landmark, CalendarDays } from "lucide-react";
import type { AccountDetail, MonthRow } from "@/lib/data";
import { formatRunway, money, NO_SHOCK, scenario, type Metrics, type Mode } from "@/lib/engine";
import { BalanceChart, InOutChart } from "./charts";
import { Card, SectionTitle, Stat } from "./ui";

export interface Peers {
  fifth: string;
  fifthIndex: number;
  bufferMonthsPctile: number; // within income fifth
  fifthMedianBufferMonths: number;
}

export function CustomerSection({
  m,
  detail,
  rows,
  peers,
  mode,
}: {
  m: Metrics;
  detail: AccountDetail | null | undefined;
  rows: MonthRow[];
  peers: Peers | null;
  mode: Mode;
}) {
  const base = scenario(m, NO_SHOCK, mode);
  const bufMonths = m.S > 0 ? m.B / m.S : null;
  const loanTone = detail?.loan ? (["B", "D"].includes(detail.loan.status) ? "text-critical-text" : "text-ink") : "text-ink";
  return (
    <section>
      <SectionTitle step="1" title="Know the customer" sub="Typical month, from every transaction on the account. Medians, so one odd month can't skew it." />
      <Card>
        {detail && (
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
            <span className="flex items-center gap-1.5">
              <User className="size-4 text-muted" aria-hidden />
              {detail.owner?.gender === "M" ? "Man" : detail.owner?.gender === "F" ? "Woman" : "Owner"}
              {detail.owner?.age ? `, ${detail.owner.age}` : ""}
              {detail.users > 1 ? ` · ${detail.users} people on account` : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-muted" aria-hidden />
              {detail.district}, {detail.region}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-muted" aria-hidden />
              {rows.length} months of history (since {rows[0]?.month})
            </span>
            {detail.owner?.card && (
              <span className="flex items-center gap-1.5">
                <CreditCard className="size-4 text-muted" aria-hidden />
                {detail.owner.card} card
              </span>
            )}
            <span className={`flex items-center gap-1.5 ${loanTone}`}>
              <Landmark className="size-4 text-muted" aria-hidden />
              {detail.loan ? `Loan ${money(detail.loan.amount)} · ${detail.loan.meaning}` : "No loan"}
            </span>
          </div>
        )}
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7"
        >
          <Stat label="Money in" code="I" value={money(m.I)} sub="typical month" />
          <Stat label="Fixed costs" code="F" value={money(m.F)} sub="bills + insurance + loan" />
          <Stat label="Spending" code="S" value={money(m.S)} sub="typical month, all money out" />
          <Stat label="Savings buffer" code="B" value={money(m.B)} sub={bufMonths !== null ? `${bufMonths.toFixed(1)} months of spending` : "—"} tone="accent" />
          <Stat label="Household bills" code="H" value={money(m.H)} sub="typical month" />
          <Stat label="Loan payment" code="P" value={money(m.P)} sub={m.P > 0 ? "loan still running" : "no running loan"} />
          <Stat
            label="Runway today"
            value={base.runway === null ? "120+" : `${formatRunway(base.runway)} mo`}
            sub={
              base.runway === null
                ? "no shortfall: earns ≥ spends"
                : base.runway === 0
                  ? "buffer already at or below zero"
                  : `spends ${money(base.gap)}/mo more than earns`
            }
            tone={base.runway === null || base.runway >= 6 ? "good" : "critical"}
          />
        </motion.div>
        {peers && bufMonths !== null && (
          <p className="mt-3 text-sm text-ink-2">
            In the <b className="text-ink">{peers.fifth.toLowerCase()} income fifth</b>, a typical customer keeps{" "}
            <b className="text-ink">{peers.fifthMedianBufferMonths.toFixed(1)} months</b> of spending in the bank. This customer keeps{" "}
            <b className="text-ink">{bufMonths.toFixed(1)}</b>, more than <b className="text-ink">{Math.round(peers.bufferMonthsPctile * 100)}%</b> of their
            income peers.
          </p>
        )}
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {rows.length > 0 ? (
            <>
              <InOutChart rows={rows} />
              <BalanceChart rows={rows} buffer={m.B} />
            </>
          ) : (
            <div className="h-52 animate-pulse rounded-xl bg-surface-2 lg:col-span-2" />
          )}
        </div>
        <SpendingMix m={m} />
      </Card>
    </section>
  );
}

function SpendingMix({ m }: { m: Metrics }) {
  const parts = [
    { label: "Household bills", v: m.H, essential: true },
    { label: "Insurance", v: m.ins, essential: true },
    { label: "Loan payments", v: m.loanPay, essential: true },
    { label: "Card spending", v: m.card, essential: false },
    { label: "Cash withdrawals", v: m.cash, essential: false },
    { label: "Other transfers out", v: m.xfer, essential: false },
    { label: "Bank fees", v: m.fees, essential: true },
  ].filter((p) => p.v > 0);
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (!total) return null;
  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">Where a typical month goes</span>
        <span className="flex gap-3 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-s1" /> Must-pay
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-s2" /> Flexible (can be cut in a crisis)
          </span>
        </span>
      </div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p) => (
          <div
            key={p.label}
            title={`${p.label}: ${money(p.v)}`}
            className={p.essential ? "bg-s1" : "bg-s2"}
            style={{ width: `${(p.v / total) * 100}%`, opacity: p.essential ? 1 : 0.85 }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {parts.map((p) => (
          <span key={p.label}>
            {p.label} <b className="tnum text-ink">{money(p.v)}</b>
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Medians of each category, so they don&apos;t add up exactly to S.</p>
    </div>
  );
}
