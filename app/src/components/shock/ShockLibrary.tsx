"use client";

import { motion } from "framer-motion";
import {
  Ban,
  Briefcase,
  Bus,
  CalendarOff,
  Car,
  Check,
  Clock,
  CloudLightning,
  Flame,
  Hammer,
  Home,
  Hourglass,
  Percent,
  Plane,
  Receipt,
  Refrigerator,
  ShieldAlert,
  ShoppingCart,
  Stethoscope,
  TrendingDown,
  Wallet,
  Zap,
  Layers,
  Route,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { Metrics, Shock } from "@/lib/engine";
import { CATEGORIES, sameShock, SHOCK_PRESETS, shockLabel, type ShockCategory, type ShockPreset } from "@/lib/shocks";

export const PRESET_ICON: Record<string, LucideIcon> = {
  job: Briefcase,
  "job-no-ei": Ban,
  "cut-25": TrendingDown,
  "cut-50": Percent,
  "unpaid-leave": CalendarOff,
  "delayed-pay": Hourglass,
  "second-income": Wallet,
  "fewer-hours": Clock,
  "rent-10": Home,
  rent: Home,
  "rent-20": Home,
  "utilities-25": Zap,
  groceries: ShoppingCart,
  insurance: ShieldAlert,
  transport: Bus,
  furnace: Flame,
  car: Car,
  medical: Stethoscope,
  travel: Plane,
  appliance: Refrigerator,
  large: Receipt,
  combo: CloudLightning,
  "cut-repair": Hammer,
  "rent-transport": Route,
  "job-expense": AlertTriangle,
  "perfect-storm": Layers,
};

function unavailable(p: ShockPreset, m: Metrics): string | null {
  if (p.key === "insurance" && !(m.ins > 0)) return "No insurance payments in this account's data.";
  if (p.key === "groceries" && !(m.disc > 0)) return "No everyday card or cash spending in this account's data.";
  return null;
}

export function ShockLibrary({ m, shock, onPick, bare }: { m: Metrics; shock: Shock; onPick: (s: Shock, p: ShockPreset) => void; bare?: boolean }) {
  const active = SHOCK_PRESETS.find((p) => sameShock(p.build(m), shock));
  const [tab, setTab] = useState<ShockCategory>(active?.category ?? "income");
  const list = SHOCK_PRESETS.filter((p) => p.category === tab);

  return (
    <section className={bare ? "" : "glass-card p-4 sm:p-5"} aria-labelledby="lib-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="lib-title" className={bare ? "sr-only" : "text-base font-semibold"}>
            Pick a shock
          </h2>
          <p className={bare ? "text-xs text-ink-2" : "text-sm text-ink-2"}>Each preset fills in hypothetical starting values. Change any of them under Adjust.</p>
        </div>
      </div>

      <div role="tablist" aria-label="Shock categories" className={`${bare ? "mt-2" : "mt-3"} -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]`}>
        {CATEGORIES.map((c) => {
          const on = tab === c.key;
          const n = SHOCK_PRESETS.filter((p) => p.category === c.key).length;
          return (
            <button
              key={c.key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(c.key)}
              className={`relative shrink-0 rounded-full font-medium whitespace-nowrap transition-colors ${bare ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${on ? "text-page" : "text-ink-2 hover:text-ink"}`}
            >
              {on && <motion.span layoutId="shock-tab" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />}
              <span className="relative">
                {c.label} <span className={`tnum text-xs ${on ? "opacity-70" : "text-muted"}`}>{n}</span>
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className={`grid grid-cols-1 sm:grid-cols-2 ${bare ? "mt-2 gap-2" : "mt-3 gap-2.5"}`}
      >
        {list.map((p) => {
          const s = p.build(m);
          const on = sameShock(s, shock);
          const Icon = PRESET_ICON[p.key] ?? Receipt;
          const off = unavailable(p, m);
          return (
            <motion.button
              key={p.key}
              type="button"
              disabled={!!off}
              onClick={() => onPick(s, p)}
              aria-pressed={on}
              whileTap={off ? undefined : { scale: 0.98 }}
              className={`group relative flex min-w-0 items-start gap-2.5 rounded-xl border text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 ${bare ? "p-2.5" : "p-3"} ${
                on
                  ? "border-accent bg-accent-soft shadow-[0_10px_30px_-18px_var(--accent)]"
                  : "border-glass-border bg-glass hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_10px_26px_-20px_var(--shadow-color)]"
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors ${on ? "bg-accent text-white" : "bg-surface-2 text-accent-ink group-hover:text-accent"}`}
              >
                {on ? <Check className="size-4.5" aria-hidden /> : <Icon className="size-4.5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-sm font-semibold text-ink">{p.title}</span>
                  {p.datathon && <span className="rounded-full bg-violet-soft px-1.5 py-px text-[10px] font-semibold tracking-wide text-violet-ink uppercase">Datathon</span>}
                </span>
                <span className={`mt-0.5 block text-xs leading-snug text-ink-2 ${bare ? "line-clamp-2" : ""}`} title={off ?? p.assumption}>
                  {off ?? p.assumption}
                </span>
                {!off && <span className="mt-0.5 block truncate text-[11px] text-muted">{shockLabel(s)}</span>}
              </span>
            </motion.button>
          );
        })}
      </motion.div>
    </section>
  );
}
