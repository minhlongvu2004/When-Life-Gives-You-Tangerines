"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Award, BarChart3, Info, Lightbulb, Lock, Mountain, Target, TrendingUp, Trophy, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  alias,
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
import { Segmented } from "../ui";
import { Panel, SectionHead } from "../whatif/bits";
import { LEAGUE_STYLE, MiniBadge } from "./ResilienceBadge";

const pctTxt = (p: number) => (p < 1 ? Math.max(0.1, Math.ceil(p * 10) / 10).toFixed(1) : `${Math.round(p)}`);

/* ------------------------------------------------------------------ league progress */

export function LeagueProgress({ data, row }: { data: RankData; row: RankRow }) {
  const { meta } = data;
  const league = leagueOfRank(meta, row.rank);
  const nl = nextLeague(data, row);
  // position from the left: bronze (bottom) → diamond (top)
  const pos = 100 * (1 - (row.rank - 1) / meta.n);
  const ladder = [...meta.leagues].reverse();
  return (
    <Panel>
      <SectionHead title="League standing" sub="Where your rank sits across the five leagues" />
      <div className="relative pt-8 pb-2">
        <div className="flex h-4 overflow-hidden rounded-full">
          {ladder.map((l) => {
            const i = meta.leagues.findIndex((x) => x.key === l.key);
            const share = l.top - (i > 0 ? meta.leagues[i - 1].top : 0);
            return (
              <div
                key={l.key}
                className="h-full border-r-2 border-[var(--surface)] last:border-0"
                style={{ width: `${share * 100}%`, background: `linear-gradient(90deg, ${LEAGUE_STYLE[l.key].dark}, ${LEAGUE_STYLE[l.key].mid})`, opacity: l.key === league ? 1 : 0.45 }}
                title={`${LEAGUE_STYLE[l.key].name}: ${Math.round(share * 100)}% of accounts`}
              />
            );
          })}
        </div>
        <motion.div
          className="absolute top-0 -translate-x-1/2"
          initial={{ left: "0%" }}
          animate={{ left: `${Math.min(99.5, Math.max(0.5, pos))}%` }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-white">YOU</div>
          <div className="rk-marker mx-auto size-4 rounded-full border-2 border-white bg-accent" />
        </motion.div>
        <div className="mt-2 flex text-[11px] text-muted">
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
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Percentile" value={`Top ${pctTxt(topPct(row.rank, meta.n))}%`} sub={`ahead of ${Math.round(100 * (1 - row.rank / meta.n))}% of accounts`} />
        <Fact label="Score to next league" value={nl.next ? `${nl.needScore?.toFixed(1)}` : "—"} sub={nl.next ? `${LEAGUE_STYLE[nl.next].name} starts here` : "You're at the top"} />
        <Fact label="Distance" value={nl.next ? `+${nl.gap?.toFixed(1)} pts` : "—"} sub={nl.next ? "score gap to close" : "Keep it up"} />
        <Fact label="Positions to climb" value={nl.next ? nl.positions!.toLocaleString("en-CA") : "—"} sub={nl.next ? `to rank #${meta.thresholds[nl.next].maxRank.toLocaleString("en-CA")}` : `${LEAGUE_STYLE[league].name} League`} />
      </div>
    </Panel>
  );
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--wf-card-2)] px-3.5 py-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="tnum mt-0.5 text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
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
      const top = R.slice(0, 10);
      return idx < 10 ? top : [...top, "gap", row];
    }
    if (view === "around") return R.slice(Math.max(0, idx - 5), idx + 6);
    // my league: the league's top 3, then the places around you inside the league
    const lo = R.findIndex((r) => leagueOfRank(data.meta, r.rank) === league);
    let hi = lo;
    while (hi + 1 < R.length && leagueOfRank(data.meta, R[hi + 1].rank) === league) hi++;
    const nearStart = Math.max(lo, idx - 3);
    const headEnd = Math.min(lo + 3, nearStart); // exclusive
    const head = R.slice(lo, headEnd);
    const near = R.slice(nearStart, Math.min(hi, idx + 3) + 1);
    return headEnd < nearStart ? [...head, "gap", ...near] : [...head, ...near];
  }, [view, data, idx, row, league]);

  return (
    <Panel>
      <SectionHead
        title="The Resilience Leaderboard"
        sub={`${data.meta.n.toLocaleString("en-CA")} ranked accounts, shown under anonymous aliases`}
        right={
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
        }
      />
      <div className="grid grid-cols-[3.5rem_1fr_auto] gap-x-3 px-3 pb-2 text-xs text-muted sm:grid-cols-[4rem_1fr_7rem_9rem]">
        <span>Rank</span>
        <span>Account</span>
        <span className="hidden sm:block">League</span>
        <span className="text-right">Score</span>
      </div>
      <ol className="space-y-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((r, i) =>
            r === "gap" ? (
              <motion.li key={`gap-${i}`} layout className="py-0.5 text-center text-xs tracking-[0.4em] text-muted" aria-hidden>
                •••
              </motion.li>
            ) : (
              <LeaderRow key={`${view}-${r.id}`} data={data} r={r} me={r.id === row.id} i={i} />
            ),
          )}
        </AnimatePresence>
      </ol>
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Other accounts appear only as generated aliases with a rank, league and score. No IDs, balances or transactions are shown. These accounts didn’t sign up to compete; the board is an
        illustrative comparison.
      </p>
    </Panel>
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
      transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 28 }}
      className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-3 rounded-xl px-3 py-2.5 sm:grid-cols-[4rem_1fr_7rem_9rem] ${
        me ? "bg-accent-soft ring-1 ring-accent/70 shadow-[0_0_30px_-8px_rgba(242,105,29,.7)]" : "bg-[var(--wf-card-2)]"
      }`}
      aria-current={me ? "true" : undefined}
    >
      <span className="tnum flex items-center gap-1 font-semibold">
        {medal ? <Trophy className="size-4" style={{ color: medal }} aria-hidden /> : null}#{r.rank.toLocaleString("en-CA")}
      </span>
      <span className="min-w-0 truncate">
        {me && <span className="mr-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">YOU</span>}
        <span className={me ? "font-semibold" : "text-ink-2"}>{alias(r.id)}</span>
      </span>
      <span className="hidden sm:block">
        <MiniBadge league={lg} />
      </span>
      <span className="flex items-center justify-end gap-2">
        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-2 sm:block">
          <span className="block h-full rounded-full" style={{ width: `${r.score}%`, background: LEAGUE_STYLE[lg].mid }} />
        </span>
        <span className="tnum w-10 text-right font-semibold">{r.score.toFixed(1)}</span>
      </span>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ breakdown */

export function relativeLabel(p: number) {
  return p >= 60 ? { text: "Relatively strong", cls: "text-good-text bg-good-soft" } : p <= 35 ? { text: "Room to grow", cls: "text-warning bg-warning-soft" } : { text: "Middle of the pack", cls: "text-ink-2 bg-surface-2" };
}

export function biggestOpportunity(data: RankData, row: RankRow): CategoryKey {
  // the category where the most weighted points are still on the table
  return [...CATEGORIES].sort((a, b) => data.meta.weights[b] * (100 - row[b]) - data.meta.weights[a] * (100 - row[a]))[0];
}

export function RankBreakdown({ data, row, strongest }: { data: RankData; row: RankRow; strongest: CategoryKey }) {
  const sc = scoreFromInputs(row, data.meta);
  const opp = biggestOpportunity(data, row);
  const medians = Object.fromEntries(CATEGORIES.map((c) => [c, data.catSorted[c][Math.floor(data.catSorted[c].length / 2)]])) as Record<CategoryKey, number>;
  const radar = CATEGORIES.map((c) => ({ cat: CATEGORY_META[c].short, you: row[c], median: medians[c] }));
  return (
    <Panel>
      <SectionHead title="Your Financial Strengths" sub="Why you're ranked here: four categories, each scored 0–100 and weighted into your total" />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-3">
          {CATEGORIES.map((c, i) => {
            const w = data.meta.weights[c];
            const p = catPercentile(data, c, row[c]);
            const lab = relativeLabel(p);
            return (
              <motion.details
                key={c}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="group rounded-2xl bg-[var(--wf-card-2)] p-4 open:ring-1 open:ring-[var(--wf-violet)]/40"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold">{CATEGORY_META[c].name}</span>
                    <span className="text-xs text-muted">{Math.round(w * 100)}% of score</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${lab.cls}`}>{lab.text}</span>
                    <span className="tnum ml-auto text-lg font-semibold">
                      {row[c].toFixed(0)}
                      <span className="text-sm text-muted">/100</span>
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg, var(--wf-violet), var(--accent))" }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${row[c]}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.1 + i * 0.08 }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-muted">
                    <span className="tnum">
                      Contributes {(w * row[c]).toFixed(1)} of {Math.round(w * 100)} points
                    </span>
                    <span className="group-open:hidden">Details ▾</span>
                    <span className="hidden group-open:inline">Hide ▴</span>
                  </div>
                </summary>
                <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
                  <p className="text-ink-2">{CATEGORY_META[c].how(row, sc)}</p>
                  <p className="text-ink-2">
                    Higher than <span className="tnum font-semibold text-ink">{Math.round(p)}%</span> of ranked accounts in this category.
                  </p>
                  <p className="flex gap-1.5 text-ink-2">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden /> {CATEGORY_META[c].improve}
                  </p>
                </div>
              </motion.details>
            );
          })}
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-[var(--wf-card-2)] p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-ink-2">
              <span>Your profile</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-accent" /> You
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full border border-ink-2" /> Median account
                </span>
              </span>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="var(--grid)" />
                  <PolarAngleAxis dataKey="cat" tick={{ fill: "var(--ink-2)", fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="median" stroke="var(--ink-2)" strokeDasharray="4 3" fill="transparent" strokeWidth={1.5} />
                  <Radar dataKey="you" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-xl">
                          <div className="font-semibold">{String(payload[0].payload.cat)}</div>
                          <div className="tnum text-ink-2">You: {Number(payload[0].payload.you).toFixed(0)} · Median: {Number(payload[0].payload.median).toFixed(0)}</div>
                        </div>
                      ) : null
                    }
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <Highlight icon={<Award className="size-5" />} tone="good" title="Your Greatest Strength">
            Your {CATEGORY_META[strongest].name.toLowerCase()} is one of your strongest resilience factors: higher than {Math.round(catPercentile(data, strongest, row[strongest]))}% of ranked
            accounts.
          </Highlight>
          <Highlight icon={<Target className="size-5" />} tone="accent" title="Your Biggest Opportunity">
            Improving your {CATEGORY_META[opp].name.toLowerCase()} could strengthen your score the most: it’s leaving{" "}
            <span className="tnum font-semibold text-ink">{(data.meta.weights[opp] * (100 - row[opp])).toFixed(1)}</span> points on the table.
          </Highlight>
        </div>
      </div>
    </Panel>
  );
}

function Highlight({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: "good" | "accent"; children: ReactNode }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${tone === "good" ? "bg-good-soft ring-good/30" : "bg-accent-soft ring-accent/40"}`}>
      <div className={`mb-1 flex items-center gap-2 font-semibold ${tone === "good" ? "text-good-text" : "text-accent-ink"}`}>
        {icon} {title}
      </div>
      <p className="text-sm leading-relaxed text-ink-2">{children}</p>
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
    <Panel className="h-full">
      <SectionHead title="Where you stand" sub="How resilience scores are spread across all ranked accounts" />
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 28, right: 12, bottom: 0, left: -12 }} barCategoryGap={2}>
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
              style={{ filter: "drop-shadow(0 0 6px var(--accent))" }}
              label={{ value: `You ${row.score.toFixed(1)}`, position: "top", fill: "var(--accent-ink)", fontSize: 12, fontWeight: 700 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-accent shadow-[0_0_6px_var(--accent)]" /> You
        </span>
        {lines.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <svg width="14" height="12" aria-hidden>
              <line x1="7" y1="0" x2="7" y2="12" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} />
            </svg>
            {l.label}
          </span>
        ))}
      </div>
    </Panel>
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
        icon: <TrendingUp className="size-5" />,
        title: `${CATEGORY_META[best.c].name} stands out`,
        text: `Your ${CATEGORY_META[best.c].name.toLowerCase()} scores higher than ${Math.round(best.p)}% of ranked accounts.`,
      });
    const opp = biggestOpportunity(data, row);
    out.push({
      icon: <Mountain className="size-5" />,
      title: `${CATEGORY_META[opp].name} is holding your rank back`,
      text: `It scores ${row[opp].toFixed(0)}/100, leaving ${(data.meta.weights[opp] * (100 - row[opp])).toFixed(1)} of your possible ${Math.round(data.meta.weights[opp] * 100)} points unclaimed.`,
    });
    const d = row.score - data.meta.median;
    out.push({
      icon: <Users className="size-5" />,
      title: d >= 0 ? "Above the middle" : "Close to the middle",
      text:
        Math.abs(d) < 0.05
          ? `Your score matches the median ranked account (${data.meta.median.toFixed(1)}).`
          : `Your score is ${Math.abs(d).toFixed(1)} points ${d > 0 ? "above" : "below"} the median ranked account (${data.meta.median.toFixed(1)}).`,
    });
    const nl = nextLeague(data, row);
    if (nl.next && nl.needScore !== null) {
      const v = leverToReach(data, row, "save", nl.needScore, 12, Math.max(row.I, row.S), now);
      out.push({
        icon: <ArrowUpRight className="size-5" />,
        title: nl.gap! <= 3 ? `Just ${nl.gap!.toFixed(1)} points from ${LEAGUE_STYLE[nl.next].name}` : `${nl.positions!.toLocaleString("en-CA")} places to ${LEAGUE_STYLE[nl.next].name}`,
        text:
          v !== null && v > 0
            ? `Increasing your available buffer by about ${money(v)} a month for 12 months could move you into ${LEAGUE_STYLE[nl.next].name}, on buffer alone.`
            : `Growing your buffer alone won't close the gap within a year; pair it with the other steps in your roadmap below.`,
      });
    } else
      out.push({ icon: <Award className="size-5" />, title: "Top league", text: "You're in Diamond. Keeping your buffer topped up is the best way to stay here." });
    return out;
  }, [data, row, now]);

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${cards.length === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
      {cards.map((c, i) => (
        <motion.div
          key={c.title}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08 }}
          className="wf-card p-4"
        >
          <div className="mb-2 grid size-9 place-items-center rounded-xl bg-[var(--wf-violet-soft)] text-[var(--wf-violet-ink)]">{c.icon}</div>
          <div className="font-semibold">{c.title}</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{c.text}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ method */

export function Methodology({ data }: { data: RankData }) {
  const { meta } = data;
  const ex = Object.entries(meta.excludedByReason);
  return (
    <Panel>
      <SectionHead title="How the Resilience Score works" sub="A custom datathon index built from this bank’s data. Not an official Tangerine score or a credit score." />
      <div className="grid gap-5 text-sm md:grid-cols-2">
        <div className="space-y-2 text-ink-2">
          <p>
            <span className="font-semibold text-ink">Score</span> = 40% Savings Buffer + 25% Cash Flow + 20% Income Stability + 15% Debt Burden. Each category is turned into 0–100 with fixed thresholds;
            values past the ends are capped, so outliers can’t dominate.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b className="text-ink">Buffer:</b> months of typical spending (median money out) covered by savings (average daily balance, last 6 months). 0 → 0, 1 mo → 25, 3 → 55, 6 → 80, 12+ → 100. A negative
              balance scores 0.
            </li>
            <li>
              <b className="text-ink">Cash flow:</b> (median in − median out) ÷ the larger of the two, so it’s relative to your own scale, not raw income. −25% → 0, break-even → 50, +25% → 100.
            </li>
            <li>
              <b className="text-ink">Stability:</b> last {meta.window} complete months of money in: 70% from variability, 30% from months below half the usual amount. Histories under {meta.window} months are
              pulled toward {meta.neutral}.
            </li>
            <li>
              <b className="text-ink">Debt:</b> running loan + leasing payments ÷ typical income (0% → 95, 10% → 82, 20% → 65, 35% → 35, 50% → 10). Loans in arrears −20. No record → {meta.debtRules.noRecord}{" "}
              (we can’t confirm debt-free), repaid loan → {meta.debtRules.repaid}, past unpaid loan → {meta.debtRules.pastDefault}.
            </li>
          </ul>
        </div>
        <div className="space-y-2 text-ink-2">
          <p>
            <span className="font-semibold text-ink">Ranking:</span> {meta.n.toLocaleString("en-CA")} of {meta.total.toLocaleString("en-CA")} accounts are ranked. {meta.tieRule} Leagues follow rank: top 5%
            Diamond, next 15% Platinum, next 30% Gold, next 30% Silver, last 20% Bronze.
          </p>
          <p>
            <span className="font-semibold text-ink">Not ranked ({(meta.total - meta.n).toLocaleString("en-CA")}):</span> {ex.map(([k, v]) => `${k.toLowerCase()} (${v})`).join(", ")}. These show “rank
            unavailable” instead of a misleading position.
          </p>
          <p className="flex gap-1.5">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Data runs to {meta.asOf}. Precomputed by <code className="text-xs">pipeline/build_rank.py</code>; your lookup loads that file, never raw
            transactions.
          </p>
          <p className="flex gap-1.5">
            <BarChart3 className="mt-0.5 size-4 shrink-0" aria-hidden /> A score describes account activity, not a person. It doesn’t judge anyone as responsible or irresponsible.
          </p>
        </div>
      </div>
    </Panel>
  );
}
