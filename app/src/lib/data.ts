"use client";

import { useEffect, useState } from "react";
import { decodeMetrics, type Metrics, type MetricsFile } from "./engine";

export interface AccountDetail {
  id: number;
  opened: string;
  frequency: string;
  district: string;
  region: string;
  districtSalary: number | null;
  districtUnemployment: number | null;
  owner: { gender: string; age: number | null; card: string | null } | null;
  users: number;
  loan: { start: string; amount: number; months: number; payment: number; status: string; meaning: string } | null;
  standingOrders: { amount: number; purpose: string }[];
  negMonths: number;
  monthsCols: string[];
  monthsRows: (string | number | null)[][];
}

export interface MonthRow {
  month: string;
  money_in: number;
  money_out: number;
  household_bills: number;
  insurance: number;
  loan_payments: number;
  discretionary: number;
  bank_fees: number;
  pension_in: number;
  month_end_balance: number;
  avg_daily_balance: number;
  min_balance: number;
  days_below_zero: number;
}

export function monthRows(d: AccountDetail): MonthRow[] {
  return d.monthsRows.map((r) => {
    const o: Record<string, unknown> = {};
    d.monthsCols.forEach((c, i) => (o[c] = r[i] ?? 0));
    return o as unknown as MonthRow;
  });
}

export interface GroupStat {
  group: string;
  n: number;
  medianIncome: number;
  medianSpending: number;
  medianBuffer: number;
  bufferMonths: number;
  failJudge: number;
  failReal: number;
  pensionerShare: number;
}

export interface Findings {
  nAccounts: number;
  nTransactions: number;
  nLoans: number;
  eiMonthlyCap: number;
  byFifth: GroupStat[];
  byTenth: GroupStat[];
  byFifthWorkers: GroupStat[];
  byTenthWorkers: GroupStat[];
  nPensioners: number;
  nonPensionerFailJudge: number;
  nonPensionerFailReal: number;
  allFailJudge: number;
  allFailReal: number;
  twists: Record<string, { zero: number; under3: number; under6: number; noShortfall: number }>;
  preLoan: {
    n: number;
    defaults: number;
    volatility: { group: string; n: number; defaultRate: number; lo: number; hi: number }[];
    volatilityAUC: number;
    paymentRatio: { group: string; n: number; defaultRate: number; lo: number; hi: number }[];
    paymentRatioAUC: number;
  };
  featured: { id: number; label: string }[];
}

let metricsP: Promise<Map<number, Metrics>> | null = null;
let findingsP: Promise<Findings> | null = null;
const detailCache = new Map<number, Promise<AccountDetail | null>>();

export function loadMetrics() {
  metricsP ??= fetch("/api/metrics")
    .then((r) => r.json() as Promise<MetricsFile>)
    .then(decodeMetrics);
  return metricsP;
}
export function loadFindings() {
  findingsP ??= fetch("/api/findings").then((r) => r.json() as Promise<Findings>);
  return findingsP;
}
export function loadDetail(id: number) {
  if (!detailCache.has(id))
    detailCache.set(
      id,
      fetch(`/api/customer/${id}`).then((r) => (r.ok ? (r.json() as Promise<AccountDetail>) : null)),
    );
  return detailCache.get(id)!;
}

export function usePromise<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [v, setV] = useState<T>();
  useEffect(() => {
    let alive = true;
    fn().then((x) => alive && setV(x));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}
