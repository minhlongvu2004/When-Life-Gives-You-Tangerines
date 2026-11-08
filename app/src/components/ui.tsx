"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ step, title, sub, right }: { step: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-accent text-sm font-semibold text-white">{step}</span>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {sub && <p className="mt-1 pl-[38px] text-sm text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  code,
  tone,
  big,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  code?: string;
  tone?: "accent" | "good" | "critical";
  big?: boolean;
}) {
  const toneCls =
    tone === "accent" ? "bg-accent-soft" : tone === "good" ? "bg-good-soft" : tone === "critical" ? "bg-critical-soft" : "bg-surface-2";
  return (
    <div className={`min-w-0 rounded-xl px-3.5 py-3 ${toneCls}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
        <span className="truncate">{label}</span>
        {code && <span className="rounded bg-surface px-1.5 py-px font-mono text-[10px] text-muted">{code}</span>}
      </div>
      <div className={`mt-1 truncate font-semibold tracking-tight ${big ? "text-3xl" : "text-xl"}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`relative rounded-full ${size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} font-medium transition-colors ${
            value === o.value ? "text-page" : "text-ink-2 hover:text-ink"
          }`}
        >
          {value === o.value && (
            <motion.span layoutId={id} className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface FieldFormat {
  /** display value = slider value × scale (e.g. 100 to show 0.15 as 15) */
  scale?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

/** Number box that stays in sync with a slider: typing moves the slider, dragging updates the box. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  decimals = 0,
  prefix,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null = not being edited
  const factor = 10 ** decimals;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * factor) / factor));
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: decimals });
  const parse = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[,\s$%×+]/g, "")));
  return (
    <span className="flex items-center gap-1 rounded-lg border border-line bg-surface-2/60 px-2 py-px text-sm focus-within:border-accent focus-within:bg-surface">
      {prefix && <span className="text-muted">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} (type a value)`}
        value={draft ?? fmt(clamp(value))}
        onFocus={(e) => {
          setDraft(fmt(clamp(value)));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parse(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const dir = e.key === "ArrowUp" ? 1 : -1;
            const next = clamp(clamp(value) + dir * step * (e.shiftKey ? 10 : 1));
            onChange(next);
            setDraft(fmt(next));
          }
        }}
        className="tnum w-[4.5rem] bg-transparent text-right font-semibold outline-none"
      />
      {suffix && <span className="text-muted">{suffix}</span>}
    </span>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  displayTitle,
  hint,
  field,
  openEnded,
  hardMax,
  curve,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** small note shown beside the number box (e.g. what the setting works out to) */
  display?: string;
  /** full text of the note, shown on hover when the note is too long to fit */
  displayTitle?: string;
  hint?: string;
  field?: FieldFormat;
  /** the box accepts values above the slider's end (up to hardMax); the thumb just stays at the end */
  openEnded?: boolean;
  hardMax?: number;
  /** >1 gives the low end of the slider more room (value = max × position^curve); the box stays exact */
  curve?: number;
}) {
  const id = useId();
  const share = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const pos = curve ? Math.pow(share, 1 / curve) : share; // thumb position 0..1
  const fill = pos * 100;
  const scale = field?.scale ?? 1;
  const decimals = field?.decimals ?? 0;
  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <label htmlFor={id} className="shrink-0 whitespace-nowrap text-ink-2">
          {label}
        </label>
        <span className="flex min-w-0 items-center justify-end gap-2">
          {display && (
            <span title={displayTitle ?? display} className="tnum min-w-0 truncate whitespace-nowrap text-xs text-muted">
              {display}
            </span>
          )}
          <NumberField
            label={label}
            value={value * scale}
            min={min * scale}
            max={(openEnded ? (hardMax ?? Infinity) : max) * scale}
            step={step * scale}
            decimals={decimals}
            prefix={field?.prefix}
            suffix={field?.suffix}
            onChange={(v) => onChange(v / scale)}
          />
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={curve ? 0 : min}
        max={curve ? 1 : max}
        step={curve ? 0.001 : step}
        value={curve ? pos : Math.min(max, Math.max(min, value))}
        onChange={(e) => {
          const x = Number(e.target.value);
          if (!curve) return onChange(x);
          const raw = min + (max - min) * Math.pow(x, curve);
          onChange(Math.round(raw / step) * step);
        }}
        style={{ ["--fill" as string]: `${fill}%` }}
        aria-label={label}
      />
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 text-sm text-ink-2"
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-accent" : "bg-grid"}`}>
        <motion.span
          className="absolute top-0.5 size-4 rounded-full bg-white shadow"
          animate={{ left: checked ? 18 : 2 }}
          transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
        />
      </span>
      {label}
    </button>
  );
}

/** Smoothly counts to a number. `format` renders the running value. */
export function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  const [, force] = useState(0);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);
  useEffect(() => text.on("change", () => force((x) => x + 1)), [text]);
  return <span className="tnum">{text.get()}</span>;
}

export function StatusBadge({ kind, children }: { kind: "good" | "warning" | "critical" | "info"; children: ReactNode }) {
  const map = {
    good: { cls: "bg-good-soft text-good-text", Icon: CheckCircle2, iconCls: "text-good" },
    warning: { cls: "bg-warning-soft text-ink", Icon: AlertTriangle, iconCls: "text-warning" },
    critical: { cls: "bg-critical-soft text-critical-text", Icon: XCircle, iconCls: "text-critical" },
    info: { cls: "bg-surface-2 text-ink-2", Icon: Info, iconCls: "text-muted" },
  }[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${map.cls}`}>
      <map.Icon className={`size-4 ${map.iconCls}`} aria-hidden />
      {children}
    </span>
  );
}

export function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <svg width="16" height="8" aria-hidden>
        <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
