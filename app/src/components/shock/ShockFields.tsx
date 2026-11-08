"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { money, type Metrics, type Shock } from "@/lib/engine";
import { FIELDS, fromDisplay, toDisplay, validateField, type FieldSpec } from "@/lib/shocks";
import { InfoTip } from "../InfoTip";
import { Toggle } from "../ui";

const fmtNum = (f: FieldSpec, v: number) => (f.unit === "$" ? Math.round(v).toLocaleString("en-CA") : String(Math.round(v * 100) / 100));

/** What the current value means in dollars for this customer. */
function consequence(f: FieldSpec, s: Shock, m: Metrics, income: number): string {
  switch (f.key) {
    case "incomePct":
      return `${money(income)}/mo${s.jobLoss ? " · job loss (EI)" : ""}`;
    case "billsPct":
      return `${s.billsPct >= 0 ? "+" : "−"}${money(Math.abs(s.billsPct * m.H))}/mo on ${money(m.H)} bills`;
    case "extraMonthly":
      return `+${money(s.extraMonthly)}/mo`;
    case "oneOffMult":
      return `${money(s.oneOffMult * m.S)} once`;
    case "oneOffAbs":
      return `${money(s.oneOffAbs)} once`;
    case "durationMonths":
      return `${s.durationMonths} month${s.durationMonths === 1 ? "" : "s"}`;
  }
}

/** One labelled control: "?" help, a number box and a slider that stay in sync, plus validation. */
export function ShockField({
  f,
  shock,
  onChange,
  m,
  income,
}: {
  f: FieldSpec;
  shock: Shock;
  onChange: (s: Shock) => void;
  m: Metrics;
  income: number;
}) {
  const v = toDisplay(f, shock);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `shock-${f.key}`;
  const errId = `${inputId}-err`;
  const commit = (x: number) => onChange({ ...shock, [f.key]: fromDisplay(f, x) });
  const sliderV = Math.min(f.sliderMax, Math.max(f.sliderMin, v));
  const fill = ((sliderV - f.sliderMin) / (f.sliderMax - f.sliderMin)) * 100;
  const shown = consequence(f, shock, m, income);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-ink-2">
          {f.label}
        </label>
        <InfoTip label={f.label}>{f.help}</InfoTip>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={shown}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="tnum ml-auto truncate text-xs text-muted"
          >
            {shown}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={f.sliderMin}
          max={f.sliderMax}
          step={f.step}
          value={sliderV}
          onChange={(e) => {
            setError(null);
            commit(Number(e.target.value));
          }}
          style={{ ["--fill" as string]: `${fill}%` }}
          aria-label={`${f.label} slider`}
          className="min-w-0 flex-1"
        />
        <div className="relative w-[7.5rem] shrink-0">
          {f.unit === "$" && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted">$</span>}
          <input
            id={inputId}
            inputMode="decimal"
            value={editing ? text : fmtNum(f, v)}
            onFocus={() => {
              setText(fmtNum(f, v));
              setEditing(true);
            }}
            onChange={(e) => {
              setText(e.target.value);
              const r = validateField(f, e.target.value);
              setError(r.error);
              if (r.value !== null) commit(r.value);
            }}
            onBlur={() => {
              setEditing(false);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-invalid={!!error}
            aria-describedby={error ? errId : undefined}
            className={`glass-field tnum w-full py-1.5 text-right text-sm font-semibold ${f.unit === "$" ? "pl-6" : "pl-2.5"} ${f.unit === "$" ? "pr-2.5" : f.unit === "months" ? "pr-9" : "pr-7"}`}
          />
          {f.unit !== "$" && (
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted">{f.unit === "months" ? "mo" : f.unit}</span>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={errId}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 text-right text-xs text-critical-text"
          >
            {error} Keeping {f.unit === "$" ? "$" : ""}
            {fmtNum(f, v)}
            {f.unit === "months" ? " months" : f.unit === "$" ? "" : f.unit}.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The six shock parameters plus the job-loss switch (it decides whether the EI cap applies in realistic mode). */
export function ShockControls({ m, shock, setShock, income }: { m: Metrics; shock: Shock; setShock: (s: Shock) => void; income: number }) {
  return (
    <div className="grid gap-y-4">
      <Toggle
        checked={shock.jobLoss}
        onChange={(on) => setShock(on ? { ...shock, jobLoss: true, incomePct: shock.incomePct === 1 ? 0.55 : shock.incomePct } : { ...shock, jobLoss: false, incomePct: 1 })}
        label="This is a job loss (EI)"
      />
      {FIELDS.map((f) => (
        <ShockField key={f.key} f={f} shock={shock} onChange={setShock} m={m} income={income} />
      ))}
    </div>
  );
}
