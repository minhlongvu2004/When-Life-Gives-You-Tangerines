"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Flag, Minus, PiggyBank, Play, RotateCcw, Scissors, TrendingUp, Wallet } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import {
  CATEGORIES,
  CATEGORY_META,
  leagueOfRank,
  leverToReach,
  loanMonthsLeft,
  money,
  nextLeague,
  NO_CHANGES,
  project,
  scoreFromInputs,
  type Changes,
  type RankData,
  type RankRow,
} from "@/lib/rank";
import { AnimatedNumber, Segmented } from "../ui";
import { Panel, SectionHead } from "../whatif/bits";
import { NumberField } from "../whatif/inputs";
import { LEAGUE_STYLE, MiniBadge, ResilienceBadge } from "./ResilienceBadge";
import { biggestOpportunity } from "./sections";

type Now = { y: number; m: number };
const r50 = (x: number) => Math.max(50, Math.round(x / 50) * 50);
const HORIZONS = [3, 6, 12, 24];

export function limits(row: RankRow, now: Now) {
  const left = loanMonthsLeft(row, now);
  return {
    save: r50(Math.max(row.I, row.S) * 0.6),
    cut: r50(row.S * 0.5),
    income: r50(row.I * 0.5),
    extraLoan: row.P > 0 && left > 0 ? r50(Math.max(500, row.P * 3)) : 0,
    loanLeft: left,
  };
}

/* ------------------------------------------------------------------ simulator */

export function RankImprovementSimulator({
  data,
  row,
  now,
  changes,
  setChanges,
}: {
  data: RankData;
  row: RankRow;
  now: Now;
  changes: Changes;
  setChanges: (c: Changes) => void;
}) {
  const lim = limits(row, now);
  const p = useMemo(() => project(data, row, changes, now), [data, row, changes, now]);
  const base = useMemo(() => scoreFromInputs(row, data.meta), [row, data]);
  const curLeague = leagueOfRank(data.meta, row.rank);
  const order = data.meta.leagues.map((l) => l.key);
  const leagueUp = order.indexOf(p.league) < order.indexOf(curLeague);
  const moved = row.rank - p.rank;
  const surplus = row.I - row.S;
  const room = Math.max(0, surplus) + changes.cut + Math.max(0, changes.income);
  const set = (k: keyof Changes, v: number) => setChanges({ ...changes, [k]: v });
  const dirty = changes.save || changes.cut || changes.income || changes.extraLoan;

  return (
    <Panel>
      <SectionHead
        title="Climb the Ranks"
        sub="Explore how changes to your financial habits could improve your resilience."
        right={
          <button onClick={() => setChanges(NO_CHANGES)} disabled={!dirty} className="btn btn-outline gap-1 rounded-full px-3 py-1.5 text-xs">
            <RotateCcw className="size-3.5" aria-hidden /> Reset
          </button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <Lever icon={<PiggyBank className="size-4" />} note="Grows your savings buffer only">
            <NumberField f={{ key: "rk-save", label: "Additional monthly savings", kind: "monthly", min: 0, max: lim.save, step: 25 }} value={changes.save} onChange={(v) => set("save", v)} />
          </Lever>
          <Lever icon={<Scissors className="size-4" />} note="Lowers spending: improves cash flow and buffer cover">
            <NumberField f={{ key: "rk-cut", label: "Reduction in monthly spending", kind: "monthly", min: 0, max: lim.cut, step: 25 }} value={changes.cut} onChange={(v) => set("cut", Math.min(v, row.S))} />
          </Lever>
          <Lever icon={<TrendingUp className="size-4" />} note="Changes income and cash flow, not income stability">
            <NumberField
              f={{ key: "rk-income", label: "Change in monthly income", kind: "monthlySigned", min: -lim.income, max: lim.income, step: 50 }}
              value={changes.income}
              onChange={(v) => set("income", Math.max(-row.I, v))}
            />
          </Lever>
          {lim.extraLoan > 0 ? (
            <Lever icon={<Wallet className="size-4" />} note={`${lim.loanLeft} payments of ${money(row.P)} left; clearing it ends the payment`}>
              <NumberField f={{ key: "rk-loan", label: "Additional loan repayment (per month)", kind: "monthly", min: 0, max: lim.extraLoan, step: 25 }} value={changes.extraLoan} onChange={(v) => set("extraLoan", v)} />
            </Lever>
          ) : (
            <p className="rounded-xl bg-[var(--wf-card-2)] px-3 py-2 text-xs text-muted">
              {row.P > 0 ? "Your loan’s schedule has already ended, so there’s nothing extra to repay." : "No running loan on record, so extra loan repayments don’t apply."}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink-2">Keep it up for</span>
            <Segmented<string> size="sm" value={String(changes.months)} onChange={(v) => set("months", Number(v))} options={HORIZONS.map((h) => ({ value: String(h), label: `${h} months` }))} />
          </div>
          {changes.save > room + 0.5 && (
            <p className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-ink">
              <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
              Saving {money(changes.save)}/mo is more than you currently have left over ({money(Math.max(0, room))}/mo). The rest would have to come from other spending.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-[var(--wf-card-2)] p-4">
            <RankBox label="Current Rank" rank={row.rank} score={row.score} league={curLeague} />
            <ArrowRight className="size-5 text-muted" aria-hidden />
            <RankBox label="Projected Rank" rank={p.rank} score={p.score} league={p.league} highlight={moved > 0} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[var(--wf-card-2)] p-4">
              <div className="text-xs text-ink-2">Potential improvement</div>
              <div className={`tnum mt-1 flex items-center gap-1.5 text-2xl font-semibold ${moved > 0 ? "text-good-text" : moved < 0 ? "text-critical-text" : ""}`}>
                {moved > 0 ? <ArrowUp className="size-5" aria-hidden /> : moved < 0 ? <ArrowDown className="size-5" aria-hidden /> : <Minus className="size-5" aria-hidden />}
                <AnimatedNumber value={Math.abs(moved)} format={(v) => Math.round(v).toLocaleString("en-CA")} />
              </div>
              <div className="text-xs text-muted">{moved === 0 ? "positions" : moved > 0 ? "positions up" : "positions down"}</div>
            </div>
            <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: leagueUp ? `${LEAGUE_STYLE[p.league].mid}22` : "var(--wf-card-2)" }}>
              <div className="text-xs text-ink-2">Projected league</div>
              <div className="mt-1 flex items-center gap-2">
                <AnimatePresence mode="wait">
                  <motion.div key={p.league} initial={{ scale: 0.5, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 15 }}>
                    <ResilienceBadge league={p.league} size={44} label={false} />
                  </motion.div>
                </AnimatePresence>
                <div>
                  <div className="font-semibold" style={{ color: LEAGUE_STYLE[p.league].ink }}>
                    {LEAGUE_STYLE[p.league].name}
                  </div>
                  <div className="text-xs text-muted">{leagueUp ? `Up from ${LEAGUE_STYLE[curLeague].name}!` : order.indexOf(p.league) > order.indexOf(curLeague) ? `Down from ${LEAGUE_STYLE[curLeague].name}` : "Same league"}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--wf-card-2)] p-4">
            <div className="mb-2 text-xs text-ink-2">Category scores: now → projected</div>
            <div className="space-y-2">
              {CATEGORIES.map((c) => {
                const d = p.scored[c] - base[c];
                return (
                  <div key={c} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 text-xs">
                    <span className="text-ink-2">{CATEGORY_META[c].short}</span>
                    <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-ink-2/40" style={{ width: `${base[c]}%` }} />
                      <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: d >= 0 ? "var(--accent)" : "var(--critical)" }} animate={{ width: `${Math.max(0, Math.min(100, p.scored[c]))}%` }} />
                    </div>
                    <span className={`tnum text-right ${Math.abs(d) < 0.05 ? "text-muted" : d > 0 ? "text-good-text" : "text-critical-text"}`}>
                      {Math.abs(d) < 0.05 ? "no change" : `${d > 0 ? "+" : ""}${d.toFixed(1)}`}
                    </span>
                  </div>
                );
              })}
            </div>
            {p.notes.length > 0 && <p className="mt-2 text-xs text-muted">{p.notes.join(". ")}.</p>}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Hypothetical projection, not a guaranteed future ranking. Your projected score is compared with today’s fixed ranking of {data.meta.n.toLocaleString("en-CA")} accounts. Extra savings,
            spending cuts and income changes are assumed to stay in this account for the whole period.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Lever({ icon, note, children }: { icon: ReactNode; note: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--wf-violet-soft)] text-[var(--wf-violet-ink)]">{icon}</span>
      <div className="min-w-0 flex-1">
        {children}
        <div className="mt-1 text-[11px] text-muted">{note}</div>
      </div>
    </div>
  );
}

function RankBox({ label, rank, score, league, highlight }: { label: string; rank: number; score: number; league: ReturnType<typeof leagueOfRank>; highlight?: boolean }) {
  return (
    <div className="min-w-0 text-center">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`tnum text-3xl font-semibold tracking-tight ${highlight ? "rk-glow-text text-accent-ink" : ""}`}>
        #<AnimatedNumber value={rank} format={(v) => Math.round(v).toLocaleString("en-CA")} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
        <MiniBadge league={league} />
        <span className="tnum text-xs text-muted">{score.toFixed(1)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ roadmap */

interface Step {
  title: string;
  detail: string;
  changes: Changes | null;
  reaches: boolean;
}

const LEVER_FOR: Record<string, { lever: "save" | "cut" | "extraLoan"; verb: (v: string) => string }> = {
  buffer: { lever: "save", verb: (v) => `Set aside ${v}/mo` },
  stability: { lever: "save", verb: (v) => `Set aside ${v}/mo` },
  cashflow: { lever: "cut", verb: (v) => `Spend ${v}/mo less` },
  debt: { lever: "extraLoan", verb: (v) => `Pay ${v}/mo extra on your loan` },
};

export function NextLeagueRoadmap({ data, row, now, onTry }: { data: RankData; row: RankRow; now: Now; onTry: (c: Changes) => void }) {
  const cur = leagueOfRank(data.meta, row.rank);
  const nl = nextLeague(data, row);
  const lim = limits(row, now);
  const T = 12;

  const steps = useMemo<Step[]>(() => {
    if (!nl.next || nl.needScore === null) return [];
    const target = nl.needScore;
    const nextName = LEAGUE_STYLE[nl.next].name;
    // weakest categories first (most weighted points left), each mapped to the lever that moves it
    const cats = [...CATEGORIES].sort((a, b) => data.meta.weights[b] * (100 - row[b]) - data.meta.weights[a] * (100 - row[a]));
    const seen = new Set<string>();
    const out: Step[] = [];
    for (const c of cats) {
      const L = LEVER_FOR[c];
      if (seen.has(L.lever)) continue;
      const max = lim[L.lever];
      if (!max) continue;
      seen.add(L.lever);
      const v = leverToReach(data, row, L.lever, target, T, max, now);
      if (v !== null) {
        const ch = { ...NO_CHANGES, months: T, [L.lever]: v };
        const p = project(data, row, ch, now);
        out.push({
          title: `${L.verb(money(v))} for ${T} months`,
          detail: `Lifts your ${CATEGORY_META[c].name.toLowerCase()} and your projected score to ${p.score.toFixed(1)}: ${nextName} League at about #${p.rank.toLocaleString("en-CA")}.`,
          changes: ch,
          reaches: p.league === nl.next || data.meta.leagues.findIndex((l) => l.key === p.league) < data.meta.leagues.findIndex((l) => l.key === nl.next),
        });
      } else {
        const ch = { ...NO_CHANGES, months: T, [L.lever]: max };
        const p = project(data, row, ch, now);
        out.push({
          title: `${L.verb(money(max))} for ${T} months`,
          detail: `Even at this level your score reaches ${p.score.toFixed(1)}, short of the ${target.toFixed(1)} needed for ${nextName}. Combine it with another step.`,
          changes: ch,
          reaches: false,
        });
      }
      if (out.length === 3) break;
    }
    // if no single step gets there, look for an even mix of saving and spending less
    if (!out.some((s) => s.reaches)) {
      const at = (k: number) => project(data, row, { ...NO_CHANGES, months: T, save: k, cut: Math.min(k, lim.cut) }, now);
      if (at(lim.save).score >= target) {
        let lo = 0;
        let hi = lim.save;
        for (let i = 0; i < 28; i++) {
          const mid = (lo + hi) / 2;
          if (at(mid).score >= target) hi = mid;
          else lo = mid;
        }
        const k = Math.ceil(hi / 25) * 25;
        const ch = { ...NO_CHANGES, months: T, save: k, cut: Math.min(k, lim.cut) };
        const p = project(data, row, ch, now);
        out.unshift({
          title: `Combine: save ${money(k)}/mo and spend ${money(Math.min(k, lim.cut))}/mo less for ${T} months`,
          detail: `Together these lift your projected score to ${p.score.toFixed(1)}: ${LEAGUE_STYLE[p.league].name} League at about #${p.rank.toLocaleString("en-CA")}.`,
          changes: ch,
          reaches: p.score >= target,
        });
      }
    }
    return out.slice(0, 3);
  }, [data, row, nl, lim, now]);

  if (!nl.next)
    return (
      <Panel>
        <SectionHead title="Your Path to the Next League" />
        <div className="flex flex-wrap items-center gap-5">
          <ResilienceBadge league="diamond" size={80} label={false} />
          <div className="min-w-0 flex-1 text-ink-2">
            <p className="text-lg font-semibold text-ink">You’re in the top league.</p>
            <p className="mt-1">
              You’re {(row.score - data.meta.thresholds.diamond.minScore).toFixed(1)} points above the Diamond line ({data.meta.thresholds.diamond.minScore.toFixed(1)}). Your{" "}
              {CATEGORY_META[biggestOpportunity(data, row)].name.toLowerCase()} has the most room left, so that’s where to protect your lead.
            </p>
          </div>
        </div>
      </Panel>
    );

  const N = LEAGUE_STYLE[nl.next];
  return (
    <Panel>
      <SectionHead title="Your Path to the Next League" sub={`Based on your weakest categories, tested against the scoring model over ${T} months`} />
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <div className="rounded-2xl bg-[var(--wf-card-2)] p-4">
          <div className="flex items-center justify-around">
            <ResilienceBadge league={cur} size={64} />
            <ArrowRight className="size-5 text-muted" aria-hidden />
            <ResilienceBadge league={nl.next} size={64} />
          </div>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-2">Required score</dt>
              <dd className="tnum font-semibold">{nl.needScore!.toFixed(1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Your score</dt>
              <dd className="tnum font-semibold">{row.score.toFixed(1)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Gap</dt>
              <dd className="tnum font-semibold" style={{ color: N.ink }}>
                +{nl.gap!.toFixed(1)} pts
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            You’re in {LEAGUE_STYLE[cur].name} League. Building on your weakest areas could help you reach {N.name}.
          </p>
        </div>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <motion.li
              key={s.title}
              initial={{ opacity: 0, x: 12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`rounded-2xl p-4 ring-1 ${s.reaches ? "bg-good-soft ring-good/30" : "bg-[var(--wf-card-2)] ring-line"}`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.reaches ? "bg-good text-page" : "bg-surface-2 text-ink-2"}`}>
                  {s.reaches ? <Flag className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.title}</div>
                  <p className="mt-0.5 text-sm text-ink-2">{s.detail}</p>
                </div>
                {s.changes && (
                  <button onClick={() => onTry(s.changes!)} className="btn btn-secondary shrink-0 gap-1 rounded-full px-3 py-1.5 text-xs font-semibold">
                    <Play className="size-3" aria-hidden /> Try it
                  </button>
                )}
              </div>
            </motion.li>
          ))}
          {!steps.length && <li className="text-sm text-ink-2">No single change in a realistic range closes this gap within 12 months. Try longer horizons in Climb the Ranks.</li>}
          <li className="text-xs text-muted">Projections use today’s ranking and the published scoring rules. They show what the model would say, not a promise of promotion.</li>
        </ol>
      </div>
    </Panel>
  );
}
