"use client";

import "../whatif/whatif.css";
import "./rank.css";
import { motion } from "framer-motion";
import { BookOpen, Info, Loader2, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadFindings, usePromise } from "@/lib/data";
import { loadRank, NO_CHANGES, type Changes, type RankData } from "@/lib/rank";
import { dataAsOf } from "@/lib/whatif/scenarios";
import { SheetButton } from "../Sheet";
import { TabBar } from "../ui";
import { Panel } from "../whatif/bits";
import { NextLeagueRoadmap, RankImprovementSimulator } from "./Climb";
import { AccountRankSearch, RankReveal, strongestCategory } from "./RankReveal";
import { Leaderboard, LeagueProgress, Methodology, RankBreakdown, RankDistribution, RankInsights } from "./sections";

type Lookup = { kind: "ranked"; id: number } | { kind: "unavailable"; id: number; reason: string } | null;
type Tab = "breakdown" | "climb" | "path";

export function RankPage() {
  const now = useMemo(() => dataAsOf(), []);
  const [data, setData] = useState<RankData>();
  const [loadErr, setLoadErr] = useState(false);
  const findings = usePromise(() => loadFindings().catch(() => null), []);
  const [lookup, setLookup] = useState<Lookup>(null);
  const [error, setError] = useState("");
  const [replay, setReplay] = useState(0);
  const [changes, setChanges] = useState<Changes>(NO_CHANGES);
  const [tab, setTab] = useState<Tab>("breakdown");

  const load = useCallback(() => {
    setLoadErr(false);
    loadRank()
      .then(setData)
      .catch(() => setLoadErr(true));
  }, []);
  useEffect(load, [load]);

  const reveal = useCallback(
    (raw: string) => {
      if (!data) return;
      const t = raw.trim();
      if (!/^\d{1,9}$/.test(t)) return setError("Account IDs are numbers only, like 20134.");
      const id = Number(t);
      setError("");
      setChanges(NO_CHANGES);
      setReplay((r) => r + 1);
      const url = new URL(window.location.href);
      url.searchParams.set("id", t);
      window.history.replaceState(null, "", url);
      if (data.byId.has(id)) setLookup({ kind: "ranked", id });
      else if (data.excluded.has(id)) setLookup({ kind: "unavailable", id, reason: data.excluded.get(id)! });
      else {
        setLookup(null);
        setError(`No account ${t} in accounts.csv. Check the number and try again.`);
      }
    },
    [data],
  );

  useEffect(() => {
    if (!data || lookup) return;
    const q = new URLSearchParams(window.location.search).get("id");
    if (q) reveal(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const examples = useMemo(() => {
    if (!data) return [];
    const ex = (findings?.featured ?? []).filter((f) => data.byId.has(f.id)).slice(0, 3);
    const pick = data.rows[Math.floor(data.rows.length * 0.37)]; // a fixed mid-table account for "Surprise me"
    return [...ex, { id: pick.id, label: "Surprise me" }];
  }, [data, findings]);

  const row = lookup?.kind === "ranked" ? data?.byId.get(lookup.id) : undefined;
  const strongest = useMemo(() => (data && row ? strongestCategory(data, row) : null), [data, row]);

  const method = data && (
    <SheetButton label="How the score works" title="How the Resilience Score works" icon={<BookOpen className="size-4" aria-hidden />}>
      <Methodology data={data} />
    </SheetButton>
  );

  /* ---------------- workspace: an account is selected */
  if (data && row && strongest)
    return (
      <div data-fill className="wf-root grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(300px,330px)_minmax(0,1fr)_minmax(340px,400px)] lg:grid-rows-[minmax(0,1fr)]">
        {/* left: account, rank reveal, league */}
        <section className="ws-panel gap-2.5 p-3" aria-label="Rank summary">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
              <Trophy className="size-4 text-accent-ink" aria-hidden /> Resilience Rank
            </h1>
            <span className="text-[11px] text-muted">data to {data.meta.asOf}</span>
          </div>
          <AccountRankSearch ready onSubmit={reveal} examples={examples} error={error} compact />
          <div className="ws-scroll -mr-1 flex flex-1 flex-col gap-3 pr-1">
            <RankReveal key={`${row.id}-${replay}`} data={data} row={row} replayKey={replay} onReplay={() => setReplay((r) => r + 1)} />
            <LeagueProgress data={data} row={row} />
            <div className="mt-auto flex flex-wrap items-center gap-2 text-[11px] text-muted">
              {method}
              <span>App-defined index, not an official Tangerine or credit score.</span>
            </div>
          </div>
        </section>

        {/* centre: leaderboard + distribution */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-label="Leaderboard">
          <div className="ws-panel shrink-0 p-3">
            <Leaderboard data={data} row={row} />
          </div>
          <div className="ws-panel min-h-[240px] flex-1 p-3 lg:min-h-0">
            <RankDistribution data={data} row={row} />
          </div>
        </section>

        {/* right: breakdown, climb, next league */}
        <section className="ws-panel p-3" aria-label="Score details and simulator">
          <TabBar
            idBase="rank-tabs"
            label="Score details"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "breakdown", label: "Score breakdown" },
              { value: "climb", label: "Climb the ranks" },
              { value: "path", label: "Next league" },
            ]}
          />
          <div id="rank-tabs-panel" role="tabpanel" aria-labelledby={`rank-tabs-tab-${tab}`} className="ws-scroll mt-2.5 flex-1 pr-1">
            {tab === "breakdown" && (
              <div className="space-y-3">
                <RankBreakdown data={data} row={row} strongest={strongest} />
                <div>
                  <div className="mb-1.5 text-xs font-semibold">Insights from the ranking</div>
                  <RankInsights data={data} row={row} now={now} />
                </div>
              </div>
            )}
            {tab === "climb" && <RankImprovementSimulator data={data} row={row} now={now} changes={changes} setChanges={setChanges} />}
            {tab === "path" && (
              <NextLeagueRoadmap
                data={data}
                row={row}
                now={now}
                onTry={(c) => {
                  setChanges(c);
                  setTab("climb");
                }}
              />
            )}
          </div>
        </section>
      </div>
    );

  /* ---------------- search / unavailable / loading */
  return (
    <div className="wf-root pb-6">
      <header className="pt-6 pb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-[var(--wf-card-2)] px-3 py-1 text-xs font-medium text-ink-2">
          <Trophy className="size-3.5 text-accent-ink" aria-hidden /> {data ? `${data.meta.n.toLocaleString("en-CA")} accounts ranked · data to ${data.meta.asOf}` : "Financial resilience leaderboard"}
        </div>
        <h1 className="wf-gradient-text mt-4 text-6xl font-semibold tracking-tighter sm:text-7xl">Resilience Rank</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-2">See where an account stands, what drives its score, and what could move it up.</p>
      </header>

      {loadErr ? (
        <Panel className="mx-auto max-w-lg text-center">
          <p className="font-semibold">Couldn’t load the rankings.</p>
          <p className="mt-1 text-sm text-ink-2">Check your connection and try again.</p>
          <button onClick={load} className="wf-cta mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white">
            Retry
          </button>
        </Panel>
      ) : (
        <div className="space-y-5">
          <AccountRankSearch ready={!!data} onSubmit={reveal} examples={examples} error={error} />
          {!data && (
            <div className="flex items-center justify-center gap-2 py-4 text-ink-2">
              <Loader2 className="size-5 animate-spin" aria-hidden /> Loading rankings…
            </div>
          )}
          {data && lookup?.kind === "unavailable" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Panel className="mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-surface-2 text-ink-2">
                  <Info className="size-6" aria-hidden />
                </div>
                <h2 className="text-xl font-semibold">Rank unavailable for account #{lookup.id}</h2>
                <p className="mt-2 text-ink-2">
                  Reason: <span className="font-semibold text-ink">{lookup.reason}</span>. Insufficient account history for a fair score, so this account isn’t placed on the leaderboard.
                </p>
                <p className="mt-2 text-sm text-muted">Ranking needs typical monthly money in and money out above zero, and recent activity from mid-2025 onward.</p>
              </Panel>
            </motion.div>
          )}
          {data && <div className="flex justify-center">{method}</div>}
        </div>
      )}
    </div>
  );
}
