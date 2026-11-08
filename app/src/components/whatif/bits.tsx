"use client";

import { Briefcase, Car, GraduationCap, Home, PiggyBank, Rocket, Scissors, Sparkles, Truck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ScenarioKind } from "@/lib/whatif/scenarios";

export const SCENARIO_ICON: Record<ScenarioKind, LucideIcon> = {
  job: Briefcase,
  move: Truck,
  car: Car,
  house: Home,
  school: GraduationCap,
  side: Rocket,
  save: PiggyBank,
  spend: Scissors,
  custom: Sparkles,
};

export const FUTURE = {
  well: { name: "If It Goes Well", tag: "Future A", ink: "var(--wf-well-ink)", mark: "var(--wf-well)", soft: "var(--wf-well-soft)", card: "wf-card-well" },
  bad: { name: "If It Goes Badly", tag: "Future B", ink: "var(--wf-bad-ink)", mark: "var(--wf-bad)", soft: "var(--wf-bad-soft)", card: "wf-card-bad" },
} as const;

export function Panel({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`wf-card p-5 sm:p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionHead({ n, title, sub, right }: { n?: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {n && (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--wf-violet-soft)] text-sm font-semibold text-[var(--wf-violet-ink)] ring-1 ring-[var(--wf-violet)]/40">
              {n}
            </span>
          )}
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {sub && <p className={`mt-1 text-sm text-ink-2 ${n ? "sm:pl-[38px]" : ""}`}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Small label that says where a number came from. */
export function Source({ kind }: { kind: "data" | "input" | "assumed" }) {
  const map = {
    data: { label: "Your data", cls: "bg-accent-soft text-accent-ink" },
    input: { label: "Hypothetical", cls: "bg-[var(--wf-violet-soft)] text-[var(--wf-violet-ink)]" },
    assumed: { label: "Assumption", cls: "bg-surface-2 text-ink-2" },
  }[kind];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${map.cls}`}>{map.label}</span>;
}

export function FutureDot({ which, size = 10 }: { which: "well" | "bad"; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: FUTURE[which].mark, boxShadow: `0 0 12px ${FUTURE[which].mark}` }} />;
}
