"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Plus, ShoppingBag, Trash2, Vault } from "lucide-react";
import { useState } from "react";
import type { Metrics } from "@/lib/engine";
import { GOAL_TEMPLATES, newGoal } from "@/lib/whatif/goals";
import { addMonths, cad, MONTHS, parseYM, SCENARIOS, ymString, type Assumptions, type Compiled, type FieldDef, type ScenarioDef, type ScenarioKind, type Values, type YM } from "@/lib/whatif/scenarios";
import type { Goal, Priority } from "@/lib/whatif/simulate";
import { FUTURE, FutureDot, SCENARIO_ICON, Source } from "./bits";

const ymLabel = (s: string) => {
  const p = parseYM(s);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : s;
};

/* ------------------------------------------------------------------ scenario picker */

export function ScenarioPicker({ value, onChange, compact }: { value: ScenarioKind; onChange: (k: ScenarioKind) => void; compact?: boolean }) {
  return (
    <div className={`grid gap-2.5 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`} role="radiogroup" aria-label="What If scenario">
      {SCENARIOS.map((s) => {
        const Icon = SCENARIO_ICON[s.kind];
        const on = s.kind === value;
        return (
          <button
            key={s.kind}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s.kind)}
            className={`group relative flex items-start gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-all ${
              on ? "border-accent/70 bg-accent-soft" : "border-line bg-[var(--wf-card-2)] hover:-translate-y-0.5 hover:border-[var(--wf-violet)]/50"
            }`}
          >
            {on && <motion.span layoutId={`scenario-glow-${compact ? "c" : "f"}`} className="absolute inset-0 -z-0 bg-gradient-to-br from-accent/10 to-[var(--wf-violet)]/10" />}
            <span
              className={`relative grid size-9 shrink-0 place-items-center rounded-xl ${on ? "bg-accent text-white" : "bg-surface-2 text-[var(--wf-violet-ink)] group-hover:text-accent-ink"}`}
            >
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="relative min-w-0">
              <span className="block text-sm leading-snug font-semibold">{s.title}</span>
              {!compact && <span className="mt-0.5 block text-xs text-muted">{s.blurb}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

function fmtField(f: FieldDef, v: number): string {
  switch (f.kind) {
    case "pct":
      return `${v}%`;
    case "rate":
      return `${v}%`;
    case "months":
      return `${v} mo`;
    case "years":
      return `${v} yr`;
    case "monthly":
    case "monthlySigned":
      return `${v > 0 && f.kind === "monthlySigned" ? "+" : ""}${cad(v)}/mo`;
    default:
      return cad(v);
  }
}

export function NumberField({ f, value, onChange }: { f: FieldDef; value: number; onChange: (v: number) => void }) {
  const min = f.min ?? 0;
  const max = Math.max(f.max ?? 100, value);
  const lo = Math.min(min, value);
  const fill = ((value - lo) / (max - lo || 1)) * 100;
  const money = f.kind === "money" || f.kind === "monthly" || f.kind === "monthlySigned";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="text-sm text-ink-2" htmlFor={`wf-${f.key}`}>
          {f.label}
        </label>
        <div className="flex items-center gap-1">
          {money && <span className="text-sm text-muted">$</span>}
          <input
            id={`wf-${f.key}`}
            type="number"
            inputMode="decimal"
            value={Number.isFinite(value) ? value : 0}
            step={f.step}
            min={f.kind === "monthlySigned" ? undefined : 0}
            onChange={(e) => {
              const x = Number(e.target.value);
              onChange(Number.isFinite(x) ? (f.kind === "monthlySigned" ? x : Math.max(0, x)) : 0);
            }}
            className="wf-input tnum w-28 px-2 py-1 text-right text-sm font-semibold"
          />
          {!money && <span className="w-6 text-xs text-muted">{f.kind === "pct" || f.kind === "rate" ? "%" : f.kind === "months" ? "mo" : f.kind === "years" ? "yr" : ""}</span>}
        </div>
      </div>
      <input
        type="range"
        min={lo}
        max={max}
        step={f.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
        aria-label={`${f.label}: ${fmtField(f, value)}`}
      />
      {f.hint && <div className="mt-1 text-xs text-muted">{f.hint}</div>}
    </div>
  );
}

export function MonthField({ label, value, onChange, now, id }: { label: string; value: string; onChange: (v: string) => void; now: YM; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-ink-2">
        {label}
      </label>
      <input
        id={id}
        type="month"
        value={value}
        min={ymString(addMonths(now, 1))}
        max={ymString(addMonths(now, 48))}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="wf-input px-2 py-1 text-sm"
      />
    </div>
  );
}

export function ScenarioForm({
  def,
  values,
  onChange,
  compiled,
  now,
}: {
  def: ScenarioDef;
  values: Values;
  onChange: (v: Values) => void;
  compiled: Compiled;
  now: YM;
}) {
  const set = (k: string, x: number | string) => onChange({ ...values, [k]: x });
  return (
    <div className="space-y-5">
      {def.fields.map((f) =>
        f.kind === "date" ? (
          <MonthField key={f.key} id={`wf-${def.kind}-${f.key}`} label={f.label} value={String(values[f.key])} onChange={(x) => set(f.key, x)} now={now} />
        ) : f.kind === "text" ? (
          <div key={f.key}>
            <label htmlFor={`wf-${f.key}`} className="mb-1.5 block text-sm text-ink-2">
              {f.label}
            </label>
            <input
              id={`wf-${f.key}`}
              value={String(values[f.key] ?? "")}
              maxLength={80}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder="e.g. take a year off to travel"
              className="wf-input w-full px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <NumberField key={f.key} f={f} value={Number(values[f.key]) || 0} onChange={(x) => set(f.key, x)} />
        ),
      )}
      {compiled.derived.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-surface-2/70 p-3">
          {compiled.derived.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-2">{d.label}</span>
              <span className="tnum font-semibold">
                {d.unit === "monthly" ? `${d.value > 0 ? "+" : ""}${cad(d.value)}/mo` : cad(d.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ goals */

const PRIORITIES: { value: Priority; label: string; cls: string }[] = [
  { value: "high", label: "High", cls: "bg-accent text-white" },
  { value: "medium", label: "Medium", cls: "bg-[var(--wf-violet)] text-white" },
  { value: "low", label: "Low", cls: "bg-ink-2 text-page" },
];

export function PriorityChip({ p }: { p: Priority }) {
  const x = PRIORITIES.find((q) => q.value === p)!;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${x.cls}`}>{x.label}</span>;
}

export function GoalsEditor({
  goals,
  onChange,
  m,
  now,
  loanEndsAt,
}: {
  goals: Goal[];
  onChange: (g: Goal[]) => void;
  m: Metrics;
  now: YM;
  loanEndsAt: number | null;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const update = (id: string, patch: Partial<Goal>) => onChange(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const add = (i: number) => {
    const g = newGoal(GOAL_TEMPLATES[i], m, now, loanEndsAt);
    onChange([...goals, g]);
    setEditing(g.id);
    setMenu(false);
  };
  return (
    <div>
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {goals.map((g) => {
            const t = GOAL_TEMPLATES.find((x) => x.template === g.template);
            const hint = t?.hint?.(m, loanEndsAt);
            const open = editing === g.id;
            return (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginTop: 0 }}
                className="overflow-hidden rounded-2xl border border-line bg-[var(--wf-card-2)]"
              >
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-[var(--wf-violet-ink)]" title={g.spend ? "Purchase: spent when reached" : "Savings: kept once reached"}>
                    {g.spend ? <ShoppingBag className="size-4" aria-hidden /> : <Vault className="size-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{g.name || "Untitled goal"}</div>
                    <div className="tnum text-xs text-muted">
                      {cad(g.target)} by {ymLabel(g.targetDate)} · {g.spend ? "spent when reached" : "kept as savings"}
                    </div>
                  </div>
                  <PriorityChip p={g.priority} />
                  <button
                    onClick={() => setEditing(open ? null : g.id)}
                    className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
                    aria-label={`Edit ${g.name}`}
                    aria-expanded={open}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => onChange(goals.filter((x) => x.id !== g.id))}
                    className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-critical-soft hover:text-critical-text"
                    aria-label={`Delete ${g.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-2">
                        <label className="block text-sm text-ink-2">
                          Goal name
                          <input value={g.name} maxLength={40} onChange={(e) => update(g.id, { name: e.target.value })} className="wf-input mt-1 w-full px-3 py-1.5 text-ink" />
                        </label>
                        <label className="block text-sm text-ink-2">
                          Target amount
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-muted">$</span>
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={g.target}
                              onChange={(e) => update(g.id, { target: Math.max(0, Number(e.target.value) || 0) })}
                              className="wf-input tnum w-full px-3 py-1.5 text-ink"
                            />
                          </div>
                        </label>
                        <label className="block text-sm text-ink-2">
                          Target date
                          <input
                            type="month"
                            value={g.targetDate}
                            min={ymString(addMonths(now, 1))}
                            onChange={(e) => e.target.value && update(g.id, { targetDate: e.target.value })}
                            className="wf-input mt-1 w-full px-3 py-1.5 text-ink"
                          />
                        </label>
                        <div className="text-sm text-ink-2">
                          Priority
                          <div className="mt-1 flex gap-1.5">
                            {PRIORITIES.map((p) => (
                              <button
                                key={p.value}
                                onClick={() => update(g.id, { priority: p.value })}
                                aria-pressed={g.priority === p.value}
                                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${g.priority === p.value ? p.cls : "bg-surface-2 text-ink-2 hover:text-ink"}`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-sm text-ink-2 sm:col-span-2">
                          When it’s reached
                          <div className="mt-1 flex gap-1.5">
                            {[
                              { v: false, l: "Keep it as savings" },
                              { v: true, l: "Spend it (a purchase)" },
                            ].map((o) => (
                              <button
                                key={o.l}
                                onClick={() => update(g.id, { spend: o.v })}
                                aria-pressed={g.spend === o.v}
                                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${g.spend === o.v ? "bg-ink text-page" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
                              >
                                {o.l}
                              </button>
                            ))}
                          </div>
                        </div>
                        {hint && <p className="text-xs text-muted sm:col-span-2">{hint}</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!goals.length && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No goals yet. Add one to see when each future gets you there.
          </div>
        )}
      </div>

      <div className="relative mt-3">
        <button
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--wf-violet)]/50 bg-[var(--wf-violet-soft)] px-4 py-3 font-semibold text-[var(--wf-violet-ink)] transition-colors hover:bg-[var(--wf-violet)]/25"
        >
          <Plus className="size-5" aria-hidden /> Add Goal
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {GOAL_TEMPLATES.map((t, i) => (
                <button
                  key={t.template}
                  onClick={() => add(i)}
                  className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left text-sm hover:border-accent"
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="tnum text-xs text-muted">{cad(t.target(m, loanEndsAt))}</div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {goals.length > 1 && (
        <p className="mt-3 text-xs text-muted">
          All goals share one pot of savings. Money goes to high-priority goals first, then by target date, so no dollar is counted twice.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ assumptions */

const A_FIELDS: { key: keyof Assumptions; kind: "months" | "pct"; min: number; max: number; step: number; label: (d: ScenarioDef) => string; upside?: boolean }[] = [
  { key: "delayMonths", kind: "months", min: 0, max: 12, step: 1, label: (d) => d.words.delay, upside: true },
  { key: "upsidePct", kind: "pct", min: 0, max: 150, step: 5, label: (d) => d.words.upside, upside: true },
  { key: "costPct", kind: "pct", min: 50, max: 200, step: 5, label: () => "One-time costs come in at (% of estimate)" },
  { key: "expensePct", kind: "pct", min: 50, max: 200, step: 5, label: () => "New monthly costs come in at (% of estimate)" },
  { key: "inflationPct", kind: "pct", min: 0, max: 10, step: 0.5, label: () => "Everyday prices rise (per year)" },
];

export function AssumptionsEditor({
  def,
  well,
  bad,
  onChange,
  showUpside,
}: {
  def: ScenarioDef;
  well: Assumptions;
  bad: Assumptions;
  onChange: (which: "well" | "bad", a: Assumptions) => void;
  showUpside: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(["well", "bad"] as const).map((w) => {
        const a = w === "well" ? well : bad;
        return (
          <div key={w} className={`wf-card ${FUTURE[w].card} space-y-4 p-4`}>
            <div className="flex items-center gap-2 font-semibold" style={{ color: FUTURE[w].ink }}>
              <FutureDot which={w} /> {FUTURE[w].tag} · {FUTURE[w].name}
              <span className="ml-auto">
                <Source kind="assumed" />
              </span>
            </div>
            {A_FIELDS.filter((f) => showUpside || !f.upside).map((f) => (
              <NumberField
                key={f.key}
                f={{ key: `${w}-${f.key}`, label: f.label(def), kind: f.kind, min: f.min, max: f.max, step: f.step }}
                value={a[f.key]}
                onChange={(x) => onChange(w, { ...a, [f.key]: x })}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
