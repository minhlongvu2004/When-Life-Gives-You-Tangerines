"use client";

import { motion } from "framer-motion";
import { ArrowRight, Search, Shuffle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadClientMap, loadDetail, loadFindings, loadMetrics, monthRows, usePromise, type AccountDetail } from "@/lib/data";
import { parseId, resolveId, type ClientRole, type Resolved } from "@/lib/ids";
import { NO_SHOCK, type Mode, type Shock } from "@/lib/engine";
import { effectiveShock } from "@/lib/planCards";
import { AskPanel } from "./AskPanel";
import { StepCustomer, StepShock, type Peers } from "./guided";
import { StepPlan } from "./RecoveryPlan";
import { StepBoundary } from "./StepBoundary";

const FIFTHS = ["lowest", "low", "middle", "high", "highest"];
const STEPS = ["Customer", "What if?", "Recovery Plan"] as const;

export function Engine() {
  const metrics = usePromise(loadMetrics, []);
  const findings = usePromise(loadFindings, []);
  const clients = usePromise(loadClientMap, []);
  const [via, setVia] = useState<{ client: number; role: ClientRole } | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("judge");
  const [shock, setShock] = useState<Shock>(NO_SHOCK);
  const [start, setStart] = useState<string | null>(null); // YYYY-MM the shock starts, null = the month after the data ends
  const [detail, setDetail] = useState<AccountDetail | null | undefined>(undefined);

  const all = useMemo(() => (metrics ? [...metrics.values()] : []), [metrics]);
  const sortedI = useMemo(() => all.map((x) => x.I).sort((a, b) => a - b), [all]);

  const resolve = useCallback((n: number | null) => resolveId(n, (x) => !!metrics?.has(x), clients), [metrics, clients]);

  const open = useCallback((r: Resolved) => {
    const n = r.account;
    setVia(r.client !== undefined && r.role ? { client: r.client, role: r.role } : null);
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
    setVia(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    if (!metrics || !clients || id !== null) return;
    const r = resolve(parseId(new URLSearchParams(window.location.search).get("id") ?? ""));
    if (r) open(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, clients]);

  useEffect(() => {
    if (id === null) return;
    let alive = true;
    loadDetail(id)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null));
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

  if (!m)
    return (
      <Landing ready={!!metrics && !!clients} featured={findings?.featured ?? []} onOpen={open} resolve={resolve} all={all} />
    );

  // owner's gender and age (clients.csv via dispositions.csv), branch region (accounts.csv → districts.csv). No names exist in the data.
  const who = detail?.owner
    ? `owner ${detail.owner.gender === "F" ? "female" : detail.owner.gender === "M" ? "male" : "gender n/a"}${detail.owner.age ? `, age ${detail.owner.age} in 2025` : ""} · ${detail.region}`
    : (m.region ?? "");

  return (
    <div className="flex flex-col lg:h-full lg:min-h-0">
      {/* customer pill + stepper */}
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-1 pl-4 shadow-sm">
          <span className="text-sm">
            <span className="tnum font-semibold">Account #{m.id}</span>
            {who && <span className="hidden text-ink-2 sm:inline"> · {who}</span>}
            {via && (
              <span className="hidden text-muted md:inline">
                {" "}
                · via client {via.client} ({via.role})
              </span>
            )}
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
              aria-current={step === i ? "step" : undefined}
              className={`relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors sm:gap-2 sm:px-4 sm:text-sm ${step === i ? "text-page" : "text-ink-2 hover:text-ink"}`}
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

      {/* No exit animation on purpose: waiting for the old step to finish leaving can freeze on a blank page if anything
          inside it never finishes animating. The new step simply fades in. */}
      <motion.div
        key={`${m.id}-${step}`}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={`flex flex-col justify-center ${step === 1 ? "lg:min-h-0 lg:flex-1" : "pb-2"}`}
      >
        <StepBoundary key={`${m.id}-${step}`} label={STEPS[step]} onBack={() => setStep(0)}>
          {step === 0 && <StepCustomer m={m} rows={rows} peers={peers} mode={mode} onNext={() => setStep(1)} historyMissing={detail === null} />}
          {step === 1 && (
            <StepShock m={m} mode={mode} setMode={setMode} shock={shock} setShock={setShock} start={start} setStart={setStart} all={all} onNext={() => setStep(2)} />
          )}
          {step === 2 && <StepPlan m={m} mode={mode} shock={shock} rows={rows} onRestart={close} />}
        </StepBoundary>
      </motion.div>
      {step === 2 && <AskPanel m={m} shock={effectiveShock(shock)} mode={mode} />}
    </div>
  );
}

function Landing({
  ready,
  featured,
  onOpen,
  resolve,
  all,
}: {
  ready: boolean;
  featured: { id: number; label: string }[];
  onOpen: (r: Resolved) => void;
  resolve: (n: number | null) => Resolved | null;
  all: { id: number }[];
}) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const go = (raw: string) => {
    const text = raw.trim();
    const digits = text.replace(/\D/g, "");
    if (/[A-Za-z]/.test(text) || digits === "" || digits.length > 9) {
      setErr("IDs are numbers only, like 52783 (account) or 6856613 (client).");
      return;
    }
    const r = resolve(parseId(text));
    if (!r) {
      setErr(`No account or client ${text} in accounts.csv or clients.csv. Try one of the examples below.`);
      return;
    }
    onOpen(r);
  };
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-ink-2">
          <span className="size-1.5 rounded-full bg-accent" /> 4,500 anonymized bank accounts · 1,056,320 transactions · 2020–2025
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
            placeholder={ready ? "Enter an account or client ID" : "Loading…"}
            className="tnum min-w-0 flex-1 bg-transparent py-2 text-lg outline-none placeholder:text-muted"
            aria-label="Account ID"
          />
          <button
            disabled={!ready}
            className="btn btn-primary rounded-xl px-5 py-2.5"
          >
            Go <ArrowRight className="size-4" aria-hidden />
          </button>
        </form>
        {err && <p className="mt-3 text-sm text-critical-text">{err}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
          {featured.slice(0, 3).map((f) => (
            <button
              key={f.id}
              onClick={() => onOpen({ account: f.id })}
              className="btn btn-secondary rounded-full px-3.5 py-1.5"
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => all.length && onOpen({ account: all[Math.floor(Math.random() * all.length)].id })}
            className="btn btn-outline rounded-full px-3 py-1.5"
          >
            <Shuffle className="size-3.5" aria-hidden /> Surprise me
          </button>
        </div>
      </motion.div>
      <Link href="/finding" className="group mt-12 text-sm text-ink-2 hover:text-ink">
        <span className="font-semibold text-accent-ink">The surprise:</span> the more you earn, the fewer months you survive{" "}
        <ArrowRight className="inline size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}
