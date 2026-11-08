"use client";

import "../whatif/whatif.css";
import "./rank.css";
import { motion } from "framer-motion";
import { Info, Loader2, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadFindings, usePromise } from "@/lib/data";
import { loadRank, NO_CHANGES, type Changes, type RankData } from "@/lib/rank";
import { nowYM } from "@/lib/whatif/scenarios";
import { Panel } from "../whatif/bits";
import { NextLeagueRoadmap, RankImprovementSimulator } from "./Climb";
import { AccountRankSearch, RankReveal, strongestCategory } from "./RankReveal";
import { Leaderboard, LeagueProgress, Methodology, RankBreakdown, RankDistribution, RankInsights } from "./sections";

type Lookup = { kind: "ranked"; id: number } | { kind: "unavailable"; id: number; reason: string } | null;

export function RankPage() {
  const now = useMemo(() => nowYM(), []);
  const [data, setData] = useState<RankData>();
  const [loadErr, setLoadErr] = useState(false);
  const findings = usePromise(() => loadFindings().catch(() => null), []);
  const [lookup, setLookup] = useState<Lookup>(null);
  const [error, setError] = useState("");
  const [replay, setReplay] = useState(0);
  const [changes, setChanges] = useState<Changes>(NO_CHANGES);
  const simRef = useRef<HTMLDivElement>(null);

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
        setError(`We couldn’t find account ${t}. Check the number and try again.`);
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
    const pick = data.rows[Math.floor(data.rows.length * 0.37)]; // a fixed mid-table example for "Surprise me"
    return [...ex, { id: pick.id, label: "Surprise me" }];
  }, [data, findings]);

  const row = lookup?.kind === "ranked" ? data?.byId.get(lookup.id) : undefined;
  const strongest = useMemo(() => (data && row ? strongestCategory(data, row) : null), [data, row]);

  return (
    <div className="wf-root pb-12" data-no-fit>
      <header className={`text-center ${row ? "pt-4 pb-6" : "pt-10 pb-8"}`}>
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-[var(--wf-card-2)] px-3 py-1 text-xs font-medium text-ink-2">
          <Trophy className="size-3.5 text-accent-ink" aria-hidden /> {data ? `${data.meta.n.toLocaleString("en-CA")} accounts ranked` : "Financial resilience leaderboard"}
        </div>
        <h1 className={`wf-gradient-text mt-4 font-semibold tracking-tighter ${row ? "text-5xl sm:text-6xl" : "text-6xl sm:text-7xl"}`}>Resilience Rank</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-2">Discover where you stand. Understand your strengths. Climb toward financial resilience.</p>
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
        <div className="space-y-6">
          <AccountRankSearch ready={!!data} onSubmit={reveal} examples={examples} error={error} compact={!!row} />
          {!data && (
            <div className="flex items-center justify-center gap-2 py-6 text-ink-2">
              <Loader2 className="size-5 animate-spin" aria-hidden /> Loading rankings…
            </div>
          )}

          {data && lookup?.kind === "unavailable" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Panel className="mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-surface-2 text-ink-2">
                  <Info className="size-6" aria-hidden />
                </div>
                <h2 className="text-xl font-semibold">Rank unavailable for account {lookup.id}</h2>
                <p className="mt-2 text-ink-2">
                  Reason: <span className="font-semibold text-ink">{lookup.reason}</span>. Without enough regular activity, any rank we gave would be misleading, so this account isn’t placed on the
                  leaderboard.
                </p>
                <p className="mt-2 text-sm text-muted">Ranking needs typical monthly money in and money out above zero, and recent activity from mid-2025 onward.</p>
              </Panel>
            </motion.div>
          )}

          {data && row && strongest && (
            <>
              <RankReveal key={`${row.id}-${replay}`} data={data} row={row} replayKey={replay} onReplay={() => setReplay((r) => r + 1)} />
              <LeagueProgress data={data} row={row} />
              <RankInsights data={data} row={row} now={now} />
              <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
                <Leaderboard data={data} row={row} />
                <RankDistribution data={data} row={row} />
              </div>
              <RankBreakdown data={data} row={row} strongest={strongest} />
              <NextLeagueRoadmap
                data={data}
                row={row}
                now={now}
                onTry={(c) => {
                  setChanges(c);
                  simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
              <div ref={simRef} className="scroll-mt-4">
                <RankImprovementSimulator data={data} row={row} now={now} changes={changes} setChanges={setChanges} />
              </div>
              <Methodology data={data} />
            </>
          )}

          {data && !lookup && <Methodology data={data} />}
        </div>
      )}
    </div>
  );
}
