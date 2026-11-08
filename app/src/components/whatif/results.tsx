"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock, Compass, Database, ExternalLink, Flag, ShieldAlert, Sparkles, TrendingUp, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Metrics } from "@/lib/engine";
import { cad, monthName, parseYM, MONTHS, type Assumptions, type ScenarioDef, type Values, type YM } from "@/lib/whatif/scenarios";
import { summarize, type Future, type Milestone, type Summary } from "@/lib/whatif/simulate";
import type { Chapter, Tip } from "@/lib/whatif/story";
import { AnimatedNumber } from "../ui";
import { FUTURE, FutureDot, Panel, Source } from "./bits";
import { PriorityChip } from "./inputs";

type Which = "well" | "bad";
const WHICH: Which[] = ["well", "bad"];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const ymLabel = (s: string) => {
  const p = parseYM(s);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : s;
};
const compact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}K` : a >= 1e3 ? `${+(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`;
  return (v < 0 ? "−$" : "$") + s;
};

/* ------------------------------------------------------------------ two future cards */

function Row({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1 text-sm last:border-0">
      <span className="text-xs text-ink-2">{label}</span>
      <span className="text-right">
        <span className={`tnum font-semibold ${tone === "bad" ? "text-critical-text" : tone === "good" ? "text-good-text" : ""}`}>{value}</span>
        {sub && <span className="block text-[10px] text-muted">{sub}</span>}
      </span>
    </div>
  );
}

export function FutureCards({ well, bad, h, now, wellMs, badMs }: { well: Future; bad: Future; h: number; now: YM; wellMs: Milestone[]; badMs: Milestone[] }) {
  return (
    <div className="grid gap-2.5">
      {WHICH.map((w, i) => {
        const f = w === "well" ? well : bad;
        const s = summarize(f, h);
        const ms = (w === "well" ? wellMs : badMs).filter((m) => m.kind !== "decision" && m.kind !== "low");
        const reached = s.goals.filter((g) => g.reachedByH).length;
        return (
          <motion.div key={w} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1 }}>
            <div className={`wf-card ${FUTURE[w].card} p-3`}>
              <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: FUTURE[w].ink }}>
                <FutureDot which={w} size={8} /> {FUTURE[w].tag} · {FUTURE[w].name}
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-[11px] text-muted">Projected savings, {monthName(now, h)}</span>
                <span className={`text-2xl font-semibold tracking-tight ${s.balance < 0 ? "text-critical-text" : ""}`}>
                  <AnimatedNumber value={s.balance} format={(v) => cad(v)} />
                </span>
              </div>
              <div className="text-[11px] text-ink-2">
                {s.balance >= s.start ? "Up" : "Down"} {cad(Math.abs(s.balance - s.start))} from {cad(s.start)} at the start (Dec 2025 data)
              </div>

              <div className="mt-1.5">
                <Row label="Projected monthly income" value={<AnimatedNumber value={s.income} format={(v) => `${cad(v)}/mo`} />} />
                <Row label="Projected monthly expenses" value={<AnimatedNumber value={s.expenses} format={(v) => `${cad(v)}/mo`} />} />
                <Row
                  label={s.net >= 0 ? "Monthly surplus" : "Monthly deficit"}
                  value={<AnimatedNumber value={s.net} format={(v) => `${v >= 0 ? "+" : ""}${cad(v)}/mo`} />}
                  sub={`average over ${plural(h, "month")}: ${s.avgNet >= 0 ? "+" : ""}${cad(s.avgNet)}`}
                  tone={s.net >= 0 ? "good" : "bad"}
                />
                <Row
                  label="Financial buffer"
                  value={s.balance <= 0 ? "None" : Number.isFinite(s.bufferMonths) ? `${s.bufferMonths.toFixed(1)} months` : "No spending"}
                  sub="savings ÷ monthly expenses"
                  tone={s.bufferMonths >= 3 ? "good" : s.bufferMonths < 1 ? "bad" : undefined}
                />
                <Row
                  label="Lowest point"
                  value={cad(s.low.balance)}
                  sub={s.low.t ? monthName(now, s.low.t) : "at the start"}
                  tone={s.low.balance < 0 ? "bad" : undefined}
                />
                {s.goals.length > 0 && <Row label="Goals reached" value={`${reached} of ${s.goals.length}`} tone={reached === s.goals.length ? "good" : undefined} />}
              </div>

              {s.goals.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {s.goals.map((g) => (
                    <div key={g.outcome.goal.id}>
                      <div className="mb-1 flex justify-between gap-2 text-xs">
                        <span className="truncate text-ink-2">{g.outcome.goal.name}</span>
                        <span className="tnum shrink-0 text-muted">
                          {g.reachedByH ? (
                            <span style={{ color: FUTURE[w].ink }}>{g.outcome.goal.spend ? "Done" : "Saved"} · {monthName(now, g.outcome.reachedAt ?? 0, true)}</span>
                          ) : (
                            `${Math.round(g.progress * 100)}% · ${g.outcome.reachedAt === null ? "5+ yrs" : monthName(now, g.outcome.reachedAt, true)}`
                          )}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: FUTURE[w].mark }}
                          initial={{ width: 0 }}
                          animate={{ width: `${g.progress * 100}%` }}
                          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {ms.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">Milestones</div>
                  <ol className="space-y-1">
                    {ms.slice(0, 3).map((m, j) => (
                      <li key={j} className="flex gap-2 text-xs">
                        <span className="tnum w-14 shrink-0 text-xs leading-5 text-muted">{monthName(now, m.t, true)}</span>
                        <MilestoneIcon m={m} which={w} />
                        <span className="min-w-0 text-ink-2">
                          <span className="text-ink">{m.title}</span> · {m.detail}
                        </span>
                      </li>
                    ))}
                    {ms.length > 3 && <li className="pl-16 text-[11px] text-muted">+{ms.length - 3} more on the map</li>}
                  </ol>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function MilestoneIcon({ m, which }: { m: Milestone; which: Which }) {
  const cls = "mt-0.5 size-4 shrink-0";
  if (m.kind === "goal") return <Flag className={cls} style={{ color: FUTURE[which].ink }} aria-hidden />;
  if (m.tone === "bad") return <AlertTriangle className={`${cls} text-critical-text`} aria-hidden />;
  if (m.tone === "good") return <TrendingUp className={cls} style={{ color: FUTURE[which].ink }} aria-hidden />;
  return <Clock className={`${cls} text-muted`} aria-hidden />;
}

/* ------------------------------------------------------------------ savings projection chart */

export function SavingsChart({ well, bad, h, now }: { well: Future; bad: Future; h: number; now: YM }) {
  const data = well.points.slice(0, h + 1).map((p, t) => ({ t, well: p.balance, bad: bad.points[t].balance, wellNet: p.net, badNet: bad.points[t].net }));
  const goalDots = WHICH.flatMap((w) => {
    const f = w === "well" ? well : bad;
    return f.goals
      .filter((g) => g.reachedAt !== null && g.reachedAt >= 1 && g.reachedAt <= h)
      .map((g) => ({ w, t: g.reachedAt!, y: f.points[g.reachedAt!].balance, name: g.goal.name }));
  });
  const goalsAt = (t: number) => goalDots.filter((d) => d.t === t);
  const anyNeg = data.some((d) => d.well < 0 || d.bad < 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Savings projection</h3>
          <div className="flex flex-wrap gap-3 text-[11px] text-ink-2">
            <LineKey which="well" />
            <LineKey which="bad" dashed />
            <span className="flex items-center gap-1.5">
              <Flag className="size-3.5" aria-hidden /> goal reached
            </span>
          </div>
      </div>
      <div className="min-h-[160px] flex-1">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 70, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, h]}
              ticks={tickList(h)}
              tickFormatter={(t: number) => (t === 0 ? "Start" : monthName(now, t, true))}
              stroke="var(--axis)"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis tickFormatter={compact} stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
            {anyNeg && <ReferenceLine y={0} stroke="var(--critical)" strokeOpacity={0.6} strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const t = Number(label);
                const d = payload[0].payload as (typeof data)[number];
                const gs = goalsAt(t);
                return (
                  <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 font-semibold text-ink">{t === 0 ? `Start (${monthName(now, 0)} data)` : monthName(now, t)}</div>
                    {WHICH.map((w) => (
                      <div key={w} className="flex items-center gap-2 text-ink-2">
                        <FutureDot which={w} size={8} />
                        <span>{FUTURE[w].name}</span>
                        <span className="tnum ml-auto pl-4 font-semibold text-ink">{cad(w === "well" ? d.well : d.bad)}</span>
                      </div>
                    ))}
                    {t > 0 && (
                      <div className="mt-1 border-t border-line pt-1 text-muted">
                        Monthly net: <span className="tnum">{cad(d.wellNet)}</span> / <span className="tnum">{cad(d.badNet)}</span>
                      </div>
                    )}
                    {gs.map((g, i) => (
                      <div key={i} className="mt-1 flex items-center gap-1.5" style={{ color: FUTURE[g.w].ink }}>
                        <Flag className="size-3" aria-hidden /> {g.name} reached
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {WHICH.map((w) => (
              <Line
                key={w}
                type="monotone"
                dataKey={w}
                stroke={FUTURE[w].mark}
                strokeWidth={2.5}
                strokeDasharray={w === "bad" ? "6 4" : undefined}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
                isAnimationActive
                animationDuration={900}
                label={(p: { index?: number; x?: number | string; y?: number | string; value?: number | string }) =>
                  p.index === h ? (
                    <text key={`${w}-end`} x={Number(p.x) + 8} y={Number(p.y) + 4} fontSize={11} fontWeight={600} fill={FUTURE[w].ink}>
                      {w === "well" ? "Goes well" : "Goes badly"}
                    </text>
                  ) : (
                    <g key={`${w}-${p.index}`} />
                  )
                }
              />
            ))}
            {goalDots.map((g, i) => (
              <ReferenceDot key={i} x={g.t} y={g.y} r={6} fill={FUTURE[g.w].mark} stroke="var(--surface)" strokeWidth={2} ifOverflow="extendDomain" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function tickList(h: number) {
  const step = h <= 6 ? 1 : h <= 12 ? 3 : 6;
  const out: number[] = [];
  for (let t = 0; t <= h; t += step) out.push(t);
  return out;
}

function LineKey({ which, dashed }: { which: Which; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="20" height="8" aria-hidden>
        <line x1="1" y1="4" x2="19" y2="4" stroke={FUTURE[which].mark} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? "5 3" : undefined} />
      </svg>
      {FUTURE[which].name}
    </span>
  );
}

/* ------------------------------------------------------------------ goal achievement timeline */

export function GoalTimeline({ well, bad, h, now }: { well: Future; bad: Future; h: number; now: YM }) {
  const sw = summarize(well, h);
  const sb = summarize(bad, h);
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">Goal outcomes by {monthName(now, h)}</div>
      {!sw.goals.length ? (
        <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
          No goals yet. Add one in the <span className="font-semibold text-ink">Goals</span> tab on the left.
        </div>
      ) : (
        <div className="space-y-2">
          {sw.goals.map((gw, i) => {
            const gb = sb.goals[i];
            const g = gw.outcome.goal;
            return (
              <div key={g.id} className="rounded-xl bg-[var(--wf-card-2)] p-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{g.name}</span>
                  <PriorityChip p={g.priority} />
                  <span className="tnum ml-auto text-xs text-muted">
                    {cad(g.target)} by {ymLabel(g.targetDate)}
                  </span>
                </div>
                {[
                  { w: "well" as const, s: gw },
                  { w: "bad" as const, s: gb },
                ].map(({ w, s }) => (
                  <GoalBar key={w} which={w} s={s} h={h} now={now} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalBar({ which, s, h, now }: { which: Which; s: Summary["goals"][number]; h: number; now: YM }) {
  const r = s.outcome.reachedAt;
  const late = r !== null && r > s.outcome.targetAt;
  const outside = !s.reachedByH;
  let text: ReactNode;
  if (s.reachedByH)
    text = (
      <>
        {r === 0 ? "Already there" : monthName(now, r ?? 0)}
        {r !== null && r > 0 && (late ? ` · ${plural(r - s.outcome.targetAt, "month")} late` : s.outcome.targetAt - r > 0 ? ` · ${plural(s.outcome.targetAt - r, "month")} early` : " · on time")}
      </>
    );
  else if (s.dipped) text = <>Reached, then drawn down to {Math.round(s.progress * 100)}%</>;
  else text = r === null ? "Not within 5 years" : <>Not by {monthName(now, h, true)} · lands {monthName(now, r)}</>;
  return (
    <div className="mt-1 grid grid-cols-[5.5rem_1fr] items-center gap-x-2 gap-y-0.5">
      <span className="flex items-center gap-1.5 text-xs" style={{ color: FUTURE[which].ink }}>
        <FutureDot which={which} size={7} /> {which === "well" ? "Goes well" : "Goes badly"}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: FUTURE[which].mark, opacity: outside ? 0.55 : 1 }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, s.progress * 100)}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>
      <span
        className={`tnum col-span-2 flex items-center gap-1 text-[11px] ${outside ? "rounded-md bg-critical-soft px-2 py-0.5 text-critical-text" : late ? "text-warning" : "text-ink-2"}`}
      >
        {outside ? <XCircle className="size-3.5 shrink-0" aria-hidden /> : late ? <Clock className="size-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />}
        {text}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ the story */

export function StoryView({ well, bad }: { well: Chapter[]; bad: Chapter[] }) {
  return (
    <div className="space-y-3">
      {well.map((cw, i) => {
        const cb = bad[i];
        return (
          <motion.div
            key={cw.n}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: 0.05 * i }}
            className="grid gap-1.5"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--wf-violet-ink)] uppercase">Chapter {cw.n}</span>
              <span className="text-sm leading-tight font-semibold">{cw.title}</span>
            </div>
            {[
              { w: "well" as const, c: cw },
              { w: "bad" as const, c: cb },
            ].map(({ w, c }) => (
              <div key={w} className={`wf-card ${FUTURE[w].card} p-2.5`}>
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold" style={{ color: FUTURE[w].ink }}>
                  <FutureDot which={w} size={7} /> {FUTURE[w].name}
                </div>
                <p className="text-xs leading-relaxed text-ink-2">{c.text}</p>
              </div>
            ))}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ guidance */

export function GuidanceView({ good, bad }: { good: Tip[]; bad: Tip[] }) {
  const cols = [
    { key: "well" as const, title: "Make the Good Future More Likely", Icon: Sparkles, tips: good },
    { key: "bad" as const, title: "Prepare for the Difficult Future", Icon: ShieldAlert, tips: bad },
  ];
  return (
    <div className="grid gap-3">
      {cols.map((c) => (
        <div key={c.key} className={`wf-card ${FUTURE[c.key].card} p-3`}>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg" style={{ background: FUTURE[c.key].soft, color: FUTURE[c.key].ink }}>
              <c.Icon className="size-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold">{c.title}</h3>
          </div>
          {c.tips.length ? (
            <ol className="space-y-2">
              {c.tips.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="tnum grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t.title}</div>
                    <p className="text-xs leading-relaxed text-ink-2">{t.detail}</p>
                    {t.impact && (
                      <span className="tnum mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: FUTURE[c.key].soft, color: FUTURE[c.key].ink }}>
                        {t.impact}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ink-2">Nothing pressing: this future already meets your goals on time.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ what's real vs assumed */

export function Transparency({
  m,
  def,
  values,
  well,
  bad,
  loanEndsAt,
  now,
  showUpside,
}: {
  m: Metrics;
  def: ScenarioDef;
  values: Values;
  well: Assumptions;
  bad: Assumptions;
  loanEndsAt: number | null;
  now: YM;
  showUpside: boolean;
}) {
  const real: [string, string, string][] = [
    ["Typical money in", `${cad(m.I)}/mo`, "median monthly money in"],
    ["Typical money out", `${cad(m.S)}/mo`, "median monthly money out"],
    ["Starting savings", cad(m.B), "mean avg_daily_balance, last 6 months (to Dec 2025)"],
    ["Household bills", `${cad(m.H)}/mo`, "median"],
    ["Flexible spending", `${cad(m.disc)}/mo`, "card, cash, other transfers out"],
  ];
  if (m.P > 0) real.push(["Loan payment", `${cad(m.P)}/mo`, loanEndsAt !== null && loanEndsAt > 0 ? `loans.csv · last payment ${monthName(now, loanEndsAt)}` : "loans.csv"]);
  if (m.pension > 0) real.push(["Pension income", `${cad(m.pension)}/mo`, "kept in every scenario"]);
  const rows: { label: string; k: keyof Assumptions; fmt: (x: number) => string }[] = [
    ...(showUpside
      ? [
          { label: def.words.delay, k: "delayMonths" as const, fmt: (x: number) => plural(x, "month") },
          { label: def.words.upside, k: "upsidePct" as const, fmt: (x: number) => `${x}%` },
        ]
      : []),
    { label: "One-time costs vs estimate", k: "costPct", fmt: (x) => `${x}%` },
    { label: "New monthly costs vs estimate", k: "expensePct", fmt: (x) => `${x}%` },
    { label: "Everyday prices rise", k: "inflationPct", fmt: (x) => `${x}%/yr` },
  ];
  return (
    <div className="grid gap-3 text-sm">
      <Panel className="!p-3">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <Database className="size-4 text-accent-ink" aria-hidden /> From account #{m.id} <Source kind="data" />
        </div>
        <dl className="space-y-1.5 text-sm">
          {real.map(([k, v, why]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-2">
                {k}
                <span className="block text-xs text-muted">{why}</span>
              </dt>
              <dd className="tnum font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel className="!p-3">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <Compass className="size-4 text-[var(--wf-violet-ink)]" aria-hidden /> Your decision <Source kind="input" />
        </div>
        <dl className="space-y-1.5 text-sm">
          {def.fields.map((f) => (
            <div key={f.key} className="flex justify-between gap-3">
              <dt className="text-ink-2">{f.label}</dt>
              <dd className="tnum shrink-0 text-right font-semibold">
                {f.kind === "date"
                  ? ymLabel(String(values[f.key]))
                  : f.kind === "text"
                    ? String(values[f.key])
                    : f.kind === "pct" || f.kind === "rate"
                      ? `${values[f.key]}%`
                      : f.kind === "months"
                        ? `${values[f.key]} mo`
                        : f.kind === "years"
                          ? `${values[f.key]} yr`
                          : cad(Number(values[f.key]))}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel className="!p-3">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-ink-2" aria-hidden /> How the futures differ <Source kind="assumed" />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-1 text-left font-normal" />
              <th className="pb-1 text-right font-semibold" style={{ color: FUTURE.well.ink }}>
                Well
              </th>
              <th className="pb-1 text-right font-semibold" style={{ color: FUTURE.bad.ink }}>
                Badly
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-t border-line">
                <td className="py-1.5 pr-2 text-ink-2">{r.label}</td>
                <td className="tnum py-1.5 text-right font-semibold">{r.fmt(well[r.k])}</td>
                <td className="tnum py-1.5 text-right font-semibold">{r.fmt(bad[r.k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          These are possibilities, not predictions: neither future has a known probability. Inflation is compared with{" "}
          <a className="underline hover:text-ink" href="https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401" target="_blank" rel="noreferrer">
            Statistics Canada CPI <ExternalLink className="inline size-3" aria-hidden />
          </a>
          ; income is not inflated.
        </p>
      </Panel>
    </div>
  );
}
