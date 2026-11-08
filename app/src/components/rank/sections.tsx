"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Award, BarChart3, Info, Lightbulb, Mountain, Target, TrendingUp, Trophy, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  accountLabel,
  CATEGORIES,
  CATEGORY_META,
  catPercentile,
  leagueOfRank,
  leverToReach,
  money,
  nextLeague,
  scoreFromInputs,
  topPct,
  type CategoryKey,
  type RankData,
  type RankRow,
} from "@/lib/rank";
import { ProvTip } from "../ProvTip";
import { Segmented } from "../ui";
import { LEAGUE_STYLE, MiniBadge } from "./ResilienceBadge";

export const pctTxt = (p: number) => (p < 1 ? Math.max(0.1, Math.ceil(p * 10) / 10).toFixed(1) : `${Math.round(p)}`);

/* ------------------------------------------------------------------ league progress */

export function LeagueProgress({ data, row }: { data: RankData; row: RankRow }) {
  const { meta } = data;
  const league = leagueOfRank(meta, row.rank);
  const nl = nextLeague(data, row);
  // position from the left: bronze (bottom) → diamond (top)
  const pos = 100 * (1 - (row.rank - 1) / meta.n);
  const ladder = [...meta.leagues].reverse();
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        League standing <ProvTip k="rank" />
      </div>
      <div className="relative pt-6 pb-1">
        <div className="flex h-3 overflow-hidden rounded-full">
          {ladder.map((l) => {
            const i = meta.leagues.findIndex((x) => x.key === l.key);
            const share = l.top - (i > 0 ? meta.leagues[i - 1].top : 0);
            return (
              <div
                key={l.key}
                className="h-full border-r-2 border-[var(--surface)] last:border-0"
                style={{ width: `${share * 100}%`, background: `linear-gradient(90deg, ${LEAGUE_STYLE[l.key].dark}, ${LEAGUE_STYLE[l.key].mid})`, opacity: l.key === league ? 1 : 0.45 }}
                title={`${LEAGUE_STYLE[l.key].name}: ${Math.round(share * 100)}% of ranked accounts`}
              />
            );
          })}
        </div>
        <motion.div
          className="absolute top-0 -translate-x-1/2"
          initial={{ left: "0%" }}
          animate={{ left: `${Math.min(97, Math.max(3, pos))}%` }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-0.5 rounded bg-accent px-1 py-px text-[9px] font-bold whitespace-nowrap text-white">#{row.id}</div>
          <div className="rk-marker mx-auto size-3 rounded-full border-2 border-white bg-accent" />
        </motion.div>
        <div className="mt-1 flex text-[10px] text-muted">
          {ladder.map((l) => {
            const i = meta.leagues.findIndex((x) => x.key === l.key);
            const share = l.top - (i > 0 ? meta.leagues[i - 1].top : 0);
            return (
              <div key={l.key} className="truncate text-center" style={{ width: `${share * 100}%` }}>
                {LEAGUE_STYLE[l.key].name}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Fact label="Percentile" value={`Top ${pctTxt(topPct(row.rank, meta.n))}%`} sub={`scores above ${Math.round(100 * (1 - row.rank / meta.n))}% of accounts`} />
        <Fact label="Next league starts at" value={nl.next ? `${nl.needScore?.toFixed(1)}` : "—"} sub={nl.next ? `${LEAGUE_STYLE[nl.next].name} · +${nl.gap?.toFixed(1)} pts` : "Already in the top league"} />
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--wf-card-2)] px-2.5 py-1.5">
      <div className="truncate text-[11px] text-ink-2">{label}</div>
      <div className="tnum text-base font-semibold tracking-tight">{value}</div>
      {sub && <div className="truncate text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ leaderboard */

type View = "top" | "around" | "league";

export function Leaderboard({ data, row }: { data: RankData; row: RankRow }) {
  const [view, setView] = useState<View>("around");
  const idx = useMemo(() => data.rows.findIndex((r) => r.id === row.id), [data, row]);
  const league = leagueOfRank(data.meta, row.rank);

  const items: (RankRow | "gap")[] = useMemo(() => {
    const R = data.rows;
    if (view === "top") {
      const top = R.slice(0, 8);
      return idx < 8 ? top : [...top, "gap", row];
    }
    if (view === "around") return R.slice(Math.max(0, idx - 4), idx + 5);
    // my league: the league's top 3, then the places around you inside the league
    const lo = R.findIndex((r) => leagueOfRank(data.meta, r.rank) === league);
    let hi = lo;
    while (hi + 1 < R.length && leagueOfRank(data.meta, R[hi + 1].rank) === league) hi++;
    const nearStart = Math.max(lo, idx - 2);
    const headEnd = Math.min(lo + 3, nearStart); // exclusive
    const head = R.slice(lo, headEnd);
    const near = R.slice(nearStart, Math.min(hi, idx + 2) + 1);
    return headEnd < nearStart ? [...head, "gap", ...near] : [...head, ...near];
  }, [view, data, idx, row, league]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            Resilience leaderboard <ProvTip k="rank" />
          </h2>
          <p className="text-[11px] text-muted">{data.meta.n.toLocaleString("en-CA")} ranked accounts, shown by account ID (the data has no names)</p>
        </div>
        <Segmented<View>
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: "top", label: "Top Ranked" },
            { value: "around", label: "Around You" },
            { value: "league", label: "My League" },
          ]}
        />
      </div>
      <div className="grid grid-cols-[4rem_1fr_6rem_7rem] gap-x-3 px-2.5 pb-1 text-[11px] text-muted">
        <span>Rank</span>
        <span>Account</span>
        <span>League</span>
        <span className="text-right">Score</span>
      </div>
      <ol className="space-y-1" aria-label={`Leaderboard, ${view === "top" ? "top ranked" : view === "around" ? "around this account" : "this account's league"}`}>
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((r, i) =>
            r === "gap" ? (
              <motion.li key={`gap-${i}`} layout className="py-0 text-center text-xs leading-3 tracking-[0.4em] text-muted" aria-hidden>
                •••
              </motion.li>
            ) : (
              <LeaderRow key={`${view}-${r.id}`} data={data} r={r} me={r.id === row.id} i={i} />
            ),
          )}
        </AnimatePresence>
      </ol>
    </div>
  );
}

function LeaderRow({ data, r, me, i }: { data: RankData; r: RankRow; me: boolean; i: number }) {
  const lg = leagueOfRank(data.meta, r.rank);
  const medal = r.rank <= 3 ? ["#fcd34d", "#e2e8f0", "#fdba74"][r.rank - 1] : null;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ delay: i * 0.025, type: "spring", stiffness: 300, damping: 28 }}
      className={`grid grid-cols-[4rem_1fr_6rem_7rem] items-center gap-x-3 rounded-lg px-2.5 py-1.5 text-sm ${
        me ? "bg-accent-soft ring-1 ring-accent/70 shadow-[0_0_24px_-8px_rgba(242,105,29,.7)]" : "bg-[var(--wf-card-2)]"
      }`}
      aria-current={me ? "true" : undefined}
    >
      <span className="tnum flex items-center gap-1 font-semibold">
        {medal ? <Trophy className="size-3.5" style={{ color: medal }} aria-hidden /> : null}#{r.rank.toLocaleString("en-CA")}
      </span>
      <span className="min-w-0 truncate">
        {me && <span className="mr-1.5 rounded bg-accent px-1 py-px text-[9px] font-bold text-white">SELECTED</span>}
        <span className={`tnum ${me ? "font-semibold" : "text-ink-2"}`}>{accountLabel(r.id)}</span>
      </span>
      <span>
        <MiniBadge league={lg} />
      </span>
      <span className="flex items-center justify-end gap-2">
        <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-surface-2 xl:block">
          <span className="block h-full rounded-full" style={{ width: `${r.score}%`, background: LEAGUE_STYLE[lg].mid }} />
        </span>
        <span className="tnum w-10 text-right font-semibold">{r.score.toFixed(1)}</span>
      </span>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ breakdown */

export function relativeLabel(p: number) {
  return p >= 60 ? { text: "Relatively strong", cls: "text-good-text bg-good-soft" } : p <= 35 ? { text: "Room to grow", cls: "text-ink bg-warning-soft" } : { text: "Middle of the pack", cls: "text-ink-2 bg-surface-2" };
}

export function biggestOpportunity(data: RankData, row: RankRow): CategoryKey {
  // the category where the most weighted points are still on the table
  return [...CATEGORIES].sort((a, b) => data.meta.weights[b] * (100 - row[b]) - data.meta.weights[a] * (100 - row[a]))[0];
}

export function RankBreakdown({ data, row, strongest }: { data: RankData; row: RankRow; strongest: CategoryKey }) {
  const sc = scoreFromInputs(row, data.meta);
  const opp = biggestOpportunity(data, row);
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-2">Four categories, each scored 0–100 and weighted into the total. Open one to see the calculation from this account&apos;s data.</p>
      {CATEGORIES.map((c, i) => {
        const w = data.meta.weights[c];
        const p = catPercentile(data, c, row[c]);
        const lab = relativeLabel(p);
        return (
          <details key={c} className="group rounded-xl bg-[var(--wf-card-2)] px-3 py-2 open:ring-1 open:ring-[var(--wf-violet)]/40">
            <summary className="cursor-pointer list-none rounded focus-visible:outline-2 focus-visible:outline-accent">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold">{CATEGORY_META[c].name}</span>
                <span className="text-[11px] text-muted">{Math.round(w * 100)}%</span>
                <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${lab.cls}`}>{lab.text}</span>
                <span className="tnum ml-auto text-base font-semibold">
                  {row[c].toFixed(0)}
                  <span className="text-xs text-muted">/100</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, var(--wf-violet), var(--accent))" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${row[c]}%` }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.08 }}
                />
              </div>
              <div className="mt-0.5 flex justify-between text-[11px] text-muted">
                <span className="tnum">
                  {(w * row[c]).toFixed(1)} of {Math.round(w * 100)} points
                </span>
                <span className="group-open:hidden">Details ▾</span>
                <span className="hidden group-open:inline">Hide ▴</span>
              </div>
            </summary>
            <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
              <p className="text-ink-2">{CATEGORY_META[c].how(row, sc)}</p>
              <p className="text-ink-2">
                Higher than <span className="tnum font-semibold text-ink">{Math.round(p)}%</span> of ranked accounts in this category.
              </p>
              <p className="flex gap-1.5 text-ink-2">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden /> {CATEGORY_META[c].improve}
              </p>
            </div>
          </details>
        );
      })}
      <Highlight icon={<Award className="size-4" />} tone="good" title="Strongest category">
        {CATEGORY_META[strongest].name}: higher than {Math.round(catPercentile(data, strongest, row[strongest]))}% of ranked accounts.
      </Highlight>
      <Highlight icon={<Target className="size-4" />} tone="accent" title="Biggest opportunity">
        {CATEGORY_META[opp].name} leaves <span className="tnum font-semibold text-ink">{(data.meta.weights[opp] * (100 - row[opp])).toFixed(1)}</span> weighted points unclaimed.
      </Highlight>
    </div>
  );
}

function Highlight({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: "good" | "accent"; children: ReactNode }) {
  return (
    <div className={`rounded-xl px-3 py-2 ring-1 ${tone === "good" ? "bg-good-soft ring-good/30" : "bg-accent-soft ring-accent/40"}`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${tone === "good" ? "text-good-text" : "text-accent-ink"}`}>
        {icon} {title}
      </div>
      <p className="text-xs leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ distribution */

export function RankDistribution({ data, row }: { data: RankData; row: RankRow }) {
  const { meta } = data;
  const nl = nextLeague(data, row);
  const W = 5;
  const bins = useMemo(() => {
    const b = Array.from({ length: 100 / W }, (_, i) => ({ lo: i * W, hi: (i + 1) * W, mid: i * W + W / 2, n: 0 }));
    for (const r of data.rows) b[Math.min(b.length - 1, Math.floor(r.score / W))].n++;
    return b;
  }, [data]);
  const mine = Math.min(bins.length - 1, Math.floor(row.score / W));
  const lines: { x: number; label: string; color: string; dash?: string }[] = [
    { x: meta.median, label: `Median ${meta.median.toFixed(1)}`, color: "var(--ink-2)", dash: "4 4" },
    { x: meta.top10, label: `Top 10% ${meta.top10.toFixed(1)}`, color: "var(--wf-violet-ink)", dash: "4 4" },
  ];
  if (nl.needScore !== null && nl.next) lines.push({ x: nl.needScore, label: `${LEAGUE_STYLE[nl.next].name} ${nl.needScore.toFixed(1)}`, color: LEAGUE_STYLE[nl.next].mid, dash: "2 3" });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold">Percentile distribution</h2>
        <p className="text-[11px] text-muted">Number of ranked accounts in each 5-point score band</p>
      </div>
      <div className="min-h-[170px] flex-1">
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 22, right: 12, bottom: 0, left: -12 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="mid" type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} />
            <YAxis stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "var(--grid)", fillOpacity: 0.5 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-xl">
                    <div className="font-semibold">
                      Scores {payload[0].payload.lo}–{payload[0].payload.hi}
                    </div>
                    <div className="tnum text-ink-2">{Number(payload[0].payload.n).toLocaleString("en-CA")} accounts</div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="n" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900}>
              {bins.map((b, i) => (
                <Cell key={i} fill={i === mine ? "var(--accent)" : "var(--wf-violet)"} fillOpacity={i === mine ? 1 : 0.4} />
              ))}
            </Bar>
            {lines.map((l) => (
              <ReferenceLine key={l.label} x={l.x} stroke={l.color} strokeDasharray={l.dash} strokeWidth={1.5} />
            ))}
            <ReferenceLine
              x={row.score}
              stroke="var(--accent)"
              strokeWidth={2.5}
              label={{ value: `#${row.id}: ${row.score.toFixed(1)}`, position: "top", fill: "var(--accent-ink)", fontSize: 11, fontWeight: 700 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-accent" /> This account
        </span>
        {lines.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <svg width="10" height="12" aria-hidden>
              <line x1="5" y1="0" x2="5" y2="12" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
            </svg>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ insights */

export function RankInsights({ data, row, now }: { data: RankData; row: RankRow; now: { y: number; m: number } }) {
  const cards = useMemo(() => {
    const out: { icon: ReactNode; title: string; text: string }[] = [];
    const pcts = CATEGORIES.map((c) => ({ c, p: catPercentile(data, c, row[c]) })).sort((a, b) => b.p - a.p);
    const best = pcts[0];
    if (best.p >= 50)
      out.push({
        icon: <TrendingUp className="size-4" />,
        title: `${CATEGORY_META[best.c].name} stands out`,
        text: `Scores higher than ${Math.round(best.p)}% of ranked accounts.`,
      });
    const opp = biggestOpportunity(data, row);
    out.push({
      icon: <Mountain className="size-4" />,
      title: `${CATEGORY_META[opp].name} holds the rank back`,
      text: `${row[opp].toFixed(0)}/100, leaving ${(data.meta.weights[opp] * (100 - row[opp])).toFixed(1)} of ${Math.round(data.meta.weights[opp] * 100)} possible points.`,
    });
    const d = row.score - data.meta.median;
    out.push({
      icon: <Users className="size-4" />,
      title: d >= 0 ? "Above the median" : "Below the median",
      text:
        Math.abs(d) < 0.05
          ? `Matches the median ranked account (${data.meta.median.toFixed(1)}).`
          : `${Math.abs(d).toFixed(1)} points ${d > 0 ? "above" : "below"} the median ranked account (${data.meta.median.toFixed(1)}).`,
    });
    const nl = nextLeague(data, row);
    if (nl.next && nl.needScore !== null) {
      const v = leverToReach(data, row, "save", nl.needScore, 12, Math.max(row.I, row.S), now);
      out.push({
        icon: <ArrowUpRight className="size-4" />,
        title: `${nl.gap!.toFixed(1)} points from ${LEAGUE_STYLE[nl.next].name}`,
        text:
          v !== null && v > 0
            ? `Hypothetically, adding about ${money(v)} a month to the buffer for 12 months would reach it on buffer alone.`
            : "Growing the buffer alone wouldn't close the gap within a year in this model.",
      });
    }
    return out;
  }, [data, row, now]);

  return (
    <ul className="space-y-1.5">
      {cards.map((c) => (
        <li key={c.title} className="flex gap-2 rounded-xl bg-[var(--wf-card-2)] px-2.5 py-2">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--wf-violet-soft)] text-[var(--wf-violet-ink)]">{c.icon}</span>
          <div className="min-w-0">
            <div className="text-xs font-semibold">{c.title}</div>
            <p className="text-xs leading-snug text-ink-2">{c.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ method */

export function Methodology({ data }: { data: RankData }) {
  const { meta } = data;
  const ex = Object.entries(meta.excludedByReason);
  return (
    <div className="space-y-4 text-sm text-ink-2">
      <p className="rounded-xl bg-warning-soft px-3 py-2 text-ink">
        An application-defined index built from this bank&apos;s datathon data. It is not an official Tangerine score or a credit-bureau score.
      </p>
      <p>
        <span className="font-semibold text-ink">Score</span> = 40% Savings Buffer + 25% Cash Flow + 20% Income Stability + 15% Debt Burden. Each category is turned into 0–100 with fixed thresholds;
        values past the ends are capped, so outliers can&apos;t dominate. Precomputed by <code className="text-xs">pipeline/build_rank.py</code> from monthly_summary.csv, loans.csv and
        standing_orders.csv; the browser re-runs the same rules (rank.json meta) for projections.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b className="text-ink">Buffer:</b> months of typical spending (median money_out) covered by savings (mean avg_daily_balance, last 6 months). 0 → 0, 1 mo → 25, 3 → 55, 6 → 80, 12+ → 100.
        </li>
        <li>
          <b className="text-ink">Cash flow:</b> (median in − median out) ÷ the larger of the two. −25% → 0, break-even → 50, +25% → 100.
        </li>
        <li>
          <b className="text-ink">Stability:</b> last {meta.window} complete months of money_in: 70% from variability, 30% from months below half the usual amount. Shorter histories are pulled toward {meta.neutral}.
        </li>
        <li>
          <b className="text-ink">Debt:</b> running loan + leasing payments ÷ typical income (0% → 95, 10% → 82, 20% → 65, 35% → 35, 50% → 10). Loans in arrears −20. No record → {meta.debtRules.noRecord}, repaid
          loan → {meta.debtRules.repaid}, past unpaid loan → {meta.debtRules.pastDefault}.
        </li>
      </ul>
      <p>
        <span className="font-semibold text-ink">Ranking:</span> {meta.n.toLocaleString("en-CA")} of {meta.total.toLocaleString("en-CA")} accounts are ranked. {meta.tieRule} Top X% = rank ÷{" "}
        {meta.n.toLocaleString("en-CA")}. Leagues follow rank: top 5% Diamond, next 15% Platinum, next 30% Gold, next 30% Silver, last 20% Bronze.
      </p>
      <p>
        <span className="font-semibold text-ink">Not ranked ({(meta.total - meta.n).toLocaleString("en-CA")}):</span> {ex.map(([k, v]) => `${k.toLowerCase()} (${v})`).join(", ")}. These show “rank
        unavailable” instead of a misleading position.
      </p>
      <p className="flex gap-1.5">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Data runs to {meta.asOf}. Historical data, not live banking.
      </p>
      <p className="flex gap-1.5">
        <BarChart3 className="mt-0.5 size-4 shrink-0" aria-hidden /> A score describes account activity, not a person.
      </p>
    </div>
  );
}
