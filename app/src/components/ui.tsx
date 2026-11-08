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

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  hint?: string;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="block">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-ink-2">
          <label htmlFor={id}>{label}</label>
        </span>
        <span className="tnum font-semibold">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
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
