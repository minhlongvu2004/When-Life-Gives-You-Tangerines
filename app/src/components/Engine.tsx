"use client";

import { Search, Shuffle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadDetail, loadFindings, loadMetrics, monthRows, usePromise, type AccountDetail } from "@/lib/data";
import { balancePath, fullPlanLevers, NO_SHOCK, scenario, type Levers, type Mode, type Shock } from "@/lib/engine";
import { CustomerSection, type Peers } from "./Customer";
import { PlanSection } from "./Plan";
import { ShockSection } from "./Shock";
import { Card, Segmented } from "./ui";

const FIFTHS = ["Lowest", "Low", "Middle", "High", "Highest"];

export function Engine() {
  const metrics = usePromise(loadMetrics, []);
  const findings = usePromise(loadFindings, []);
  const [id, setId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("judge");
  const [shock, setShock] = useState<Shock>(NO_SHOCK);
  const [detail, setDetail] = useState<AccountDetail | null | undefined>(undefined);

  const all = useMemo(() => (metrics ? [...metrics.values()] : []), [metrics]);
  const sortedI = useMemo(() => all.map((x) => x.I).sort((a, b) => a - b), [all]);

  const open = useCallback(
    (raw: string | number) => {
      if (!metrics) return;
      const n = Number(String(raw).trim());
      if (!Number.isInteger(n) || !metrics.has(n)) {
        setError(`No account ${String(raw).trim() || "(blank)"}. IDs run from 20111 to 99984.`);
        return;
      }
      setError("");
      setId(n);
      setInput(String(n));
      setDetail(undefined);
      const url = new URL(window.location.href);
      url.searchParams.set("id", String(n));
      window.history.replaceState(null, "", url);
    },
    [metrics],
  );

  // deep link ?id=
  useEffect(() => {
    if (!metrics || id !== null) return;
    const q = new URLSearchParams(window.location.search).get("id");
    if (q) open(q);
  }, [metrics, id, open]);

  useEffect(() => {
    if (id === null) return;
    let alive = true;
    loadDetail(id).then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [id]);

  const m = id !== null ? metrics?.get(id) : undefined;
  const rows = useMemo(() => (detail ? monthRows(detail) : []), [detail]);

  const peers: Peers | null = useMemo(() => {
    if (!m || !sortedI.length) return null;
    // same quintile cut as the pipeline (rank-based)
    const rank = sortedI.findIndex((x) => x >= m.I);
    const fifthIndex = Math.min(4, Math.floor((rank / sortedI.length) * 5));
    const lo = sortedI[Math.floor((fifthIndex * sortedI.length) / 5)];
    const hi = sortedI[Math.min(sortedI.length - 1, Math.floor(((fifthIndex + 1) * sortedI.length) / 5) - 1)];
    const peerBuf = all.filter((x) => x.I >= lo && x.I <= hi && x.S > 0).map((x) => x.B / x.S);
    peerBuf.sort((a, b) => a - b);
    const mine = m.S > 0 ? m.B / m.S : 0;
    const below = peerBuf.filter((x) => x < mine).length;
    return {
      fifth: FIFTHS[fifthIndex],
      fifthIndex,
      bufferMonthsPctile: peerBuf.length ? below / peerBuf.length : 0,
      fifthMedianBufferMonths: peerBuf[Math.floor(peerBuf.length / 2)] ?? 0,
    };
  }, [m, sortedI, all]);

  const planLevers: Levers | null = m ? fullPlanLevers(m) : null;
  const path = useMemo(() => {
    if (!m || !planLevers) return [];
    const p = balancePath(m, shock, mode, { discCut: 0, pauseLoan: false });
    const plan = balancePath(m, shock, mode, planLevers);
    return p.map((pt, i) => ({ ...pt, plan: plan[i].balance }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, shock, mode]);

  const random = () => {
    if (!all.length) return;
    open(all[Math.floor(Math.random() * all.length)].id);
  };

  return (
    <div className="space-y-8 pt-6">
      {/* Picker */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent opacity-[0.07]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Will this customer make it?</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-2">
              Enter any account to see their money picture, hit them with a shock, and get a plan, all from their real transactions.
            </p>
          </div>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "judge", label: "Judge definitions", title: "Exactly the formulas in the challenge brief" },
              { value: "realistic", label: "Realistic", title: "EI capped at $729/week; pensions keep paying" },
            ]}
          />
        </div>
        <form
          className="relative mt-5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            open(input);
          }}
        >
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 focus-within:border-accent">
            <Search className="size-4 text-muted" aria-hidden />
            <input
              autoFocus
              inputMode="numeric"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={metrics ? "account_id, e.g. 38211" : "Loading 4,500 accounts…"}
              className="tnum w-full bg-transparent py-2.5 text-lg outline-none placeholder:text-base placeholder:text-muted"
              aria-label="Account ID"
            />
          </div>
          <button type="submit" disabled={!metrics} className="flex items-center gap-1.5 rounded-xl bg-accent px-5 font-medium text-white hover:opacity-90 disabled:opacity-50">
            Analyze <ArrowRight className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={random} disabled={!metrics} className="flex items-center gap-1.5 rounded-xl border border-line px-4 text-sm text-ink-2 hover:text-ink">
            <Shuffle className="size-4" aria-hidden /> Random
          </button>
        </form>
        {error && <p className="relative mt-2 text-sm text-critical-text">{error}</p>}
        {findings && (
          <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Try:</span>
            {findings.featured.map((f) => (
              <button key={f.id} onClick={() => open(f.id)} className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-2 hover:text-ink">
                <span className="tnum font-medium text-ink">{f.id}</span> · {f.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      {!m && <Teaser />}

      {m && (
        <>
          <CustomerSection m={m} detail={detail} rows={rows} peers={peers} mode={mode} />
          <ShockSection
            m={m}
            mode={mode}
            shock={shock}
            setShock={setShock}
            all={all}
            planScenario={planLevers ? scenario(m, shock, mode, planLevers) : scenario(m, shock, mode)}
            path={path}
          />
          <PlanSection m={m} mode={mode} shock={shock} />
        </>
      )}
    </div>
  );
}

function Teaser() {
  return (
    <Link href="/finding" className="group block">
      <Card className="flex flex-wrap items-center justify-between gap-4 transition-colors group-hover:border-accent">
        <div>
          <div className="text-xs font-medium tracking-wide text-accent-ink uppercase">Our biggest finding</div>
          <div className="mt-1 text-lg font-semibold">The more you earn, the fewer months you can survive.</div>
          <div className="text-sm text-ink-2">Top earners keep 1.8 months of spending in the bank. The lowest earners keep 8.5.</div>
        </div>
        <ArrowRight className="size-5 text-accent transition-transform group-hover:translate-x-1" aria-hidden />
      </Card>
    </Link>
  );
}
