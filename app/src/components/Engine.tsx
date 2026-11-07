"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Search, Shuffle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadDetail, loadFindings, loadMetrics, monthRows, usePromise, type AccountDetail } from "@/lib/data";
import { balancePath, fullPlanLevers, NO_SHOCK, type Mode, type Shock } from "@/lib/engine";
import { StepCustomer, StepPlan, StepShock, type Peers } from "./guided";

const FIFTHS = ["lowest", "low", "middle", "high", "highest"];
const STEPS = ["Customer", "Shock", "Plan"] as const;

export function Engine() {
  const metrics = usePromise(loadMetrics, []);
  const findings = usePromise(loadFindings, []);
  const [id, setId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("judge");
  const [shock, setShock] = useState<Shock>(NO_SHOCK);
  const [detail, setDetail] = useState<AccountDetail | null | undefined>(undefined);

  const all = useMemo(() => (metrics ? [...metrics.values()] : []), [metrics]);
  const sortedI = useMemo(() => all.map((x) => x.I).sort((a, b) => a - b), [all]);

  const open = useCallback((n: number) => {
    setId(n);
    setStep(0);
    setDetail(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("id", String(n));
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const close = () => {
    setId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    if (!metrics || id !== null) return;
    const q = Number(new URLSearchParams(window.location.search).get("id"));
    if (q && metrics.has(q)) open(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

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
    const n = sortedI.length;
    const rank = sortedI.findIndex((x) => x >= m.I);
    const f = Math.min(4, Math.floor((rank / n) * 5));
    const lo = sortedI[Math.floor((f * n) / 5)];
    const hi = sortedI[Math.min(n - 1, Math.floor(((f + 1) * n) / 5) - 1)];
    const buf = all
      .filter((x) => x.I >= lo && x.I <= hi && x.S > 0)
      .map((x) => x.B / x.S)
      .sort((a, b) => a - b);
    const mine = m.S > 0 ? m.B / m.S : 0;
    return {
      fifth: FIFTHS[f],
      bufferMonthsPctile: buf.length ? buf.filter((x) => x < mine).length / buf.length : 0,
      fifthMedianBufferMonths: buf[Math.floor(buf.length / 2)] ?? 0,
    };
  }, [m, sortedI, all]);

  const path = useMemo(() => {
    if (!m) return [];
    const p = balancePath(m, shock, mode, { discCut: 0, pauseLoan: false });
    const plan = balancePath(m, shock, mode, fullPlanLevers(m));
    return p.map((pt, i) => ({ ...pt, plan: plan[i].balance }));
  }, [m, shock, mode]);

  if (!m)
    return (
      <Landing ready={!!metrics} featured={findings?.featured ?? []} onOpen={(n) => metrics?.has(n) && open(n)} has={(n) => !!metrics?.has(n)} all={all} />
    );

  const who = detail?.owner
    ? `${detail.owner.gender === "F" ? "Woman" : detail.owner.gender === "M" ? "Man" : "Customer"}${detail.owner.age ? `, ${detail.owner.age}` : ""} · ${detail.region}`
    : "";

  return (
    <div className="pt-2">
      {/* customer pill + stepper */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-1.5 pl-4 shadow-sm">
          <span className="text-sm">
            <span className="tnum font-semibold">#{m.id}</span>
            {who && <span className="hidden text-ink-2 sm:inline"> · {who}</span>}
          </span>
          <button
            onClick={close}
            className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Change customer"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`relative flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${step === i ? "text-page" : "text-ink-2 hover:text-ink"}`}
            >
              {step === i && (
                <motion.span
                  layoutId="step-pill"
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                />
              )}
              <span className="relative tnum">{i + 1}</span>
              <span className="relative">{s}</span>
            </button>
          ))}
        </nav>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${m.id}-${step}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-h-[calc(100vh-220px)] flex-col justify-center pb-6"
        >
          {step === 0 && <StepCustomer m={m} rows={rows} peers={peers} mode={mode} onNext={() => setStep(1)} />}
          {step === 1 && <StepShock m={m} mode={mode} setMode={setMode} shock={shock} setShock={setShock} path={path} all={all} onNext={() => setStep(2)} />}
          {step === 2 && <StepPlan m={m} mode={mode} shock={shock} path={path} onRestart={close} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Landing({
  ready,
  featured,
  onOpen,
  has,
  all,
}: {
  ready: boolean;
  featured: { id: number; label: string }[];
  onOpen: (n: number) => void;
  has: (n: number) => boolean;
  all: { id: number }[];
}) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const go = (raw: string) => {
    const n = Number(raw.trim());
    if (!has(n)) {
      setErr("No customer with that ID. Try one of the examples below.");
      return;
    }
    onOpen(n);
  };
  return (
    <div className="flex min-h-[78vh] flex-col items-center justify-center text-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-ink-2">
          <span className="size-1.5 rounded-full bg-accent" /> 4,500 real bank customers · 1 million transactions
        </div>
        <h1 className="mt-6 text-5xl font-semibold tracking-tighter sm:text-7xl">
          Will they <span className="text-accent">make it?</span>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg text-ink-2">
          Pick a customer. Hit them with a layoff, a broken furnace or a rent hike. See if their savings last, and what to do about it.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(v);
          }}
          className="mx-auto mt-9 flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-lg shadow-black/5 focus-within:border-accent"
        >
          <Search className="size-5 text-muted" aria-hidden />
          <input
            ref={ref}
            autoFocus
            inputMode="numeric"
            value={v}
            onChange={(e) => {
              setV(e.target.value);
              setErr("");
            }}
            placeholder={ready ? "Enter an account ID" : "Loading…"}
            className="tnum min-w-0 flex-1 bg-transparent py-2 text-lg outline-none placeholder:text-muted"
            aria-label="Account ID"
          />
          <button
            disabled={!ready}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Go <ArrowRight className="size-4" aria-hidden />
          </button>
        </form>
        {err && <p className="mt-3 text-sm text-critical-text">{err}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
          {featured.slice(0, 3).map((f) => (
            <button
              key={f.id}
              onClick={() => onOpen(f.id)}
              className="rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-ink-2 hover:border-accent hover:text-ink"
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => all.length && onOpen(all[Math.floor(Math.random() * all.length)].id)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:text-ink"
          >
            <Shuffle className="size-3.5" aria-hidden /> Surprise me
          </button>
        </div>
      </motion.div>
      <Link href="/finding" className="group mt-20 text-sm text-ink-2 hover:text-ink">
        <span className="font-semibold text-accent-ink">The surprise:</span> the more you earn, the fewer months you survive{" "}
        <ArrowRight className="inline size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}
