"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick } from "lucide-react";
import { useMemo, useState } from "react";
import { cad, monthName, type YM } from "@/lib/whatif/scenarios";
import { summarize, type Future, type Milestone } from "@/lib/whatif/simulate";
import { FUTURE, FutureDot, SCENARIO_ICON } from "./bits";
import type { ScenarioKind } from "@/lib/whatif/scenarios";

const W = 1000;
const H = 380;
const NODE = { x: 118, y: H / 2 };
const X0 = 330; // where the branches straighten out (month 0)
const X1 = 905; // the horizon
const Y = { well: 92, bad: H - 92 };
const MAX_PER_BRANCH = 12;

const KEEP: Milestone["kind"][] = ["negative", "goal", "recover", "income", "loan", "cushion", "event", "low", "cost", "decision"];

/** Pick at most MAX_PER_BRANCH milestones, keeping the important kinds first. */
function pick(ms: Milestone[]): Milestone[] {
  if (ms.length <= MAX_PER_BRANCH) return ms;
  return [...ms].sort((a, b) => KEEP.indexOf(a.kind) - KEEP.indexOf(b.kind)).slice(0, MAX_PER_BRANCH).sort((a, b) => a.t - b.t);
}

export function FutureMap({
  kind,
  title,
  well,
  bad,
  wellMs,
  badMs,
  h,
  now,
  replay,
}: {
  kind: ScenarioKind;
  title: string;
  well: Future;
  bad: Future;
  wellMs: Milestone[];
  badMs: Milestone[];
  h: number;
  now: YM;
  replay: number;
}) {
  const [sel, setSel] = useState<{ which: "well" | "bad"; i: number } | null>(null);
  const Icon = SCENARIO_ICON[kind];
  const x = (t: number) => X0 + (Math.min(t, h) / h) * (X1 - X0);
  const branches = useMemo(
    () =>
      (["well", "bad"] as const).map((w) => {
        const f = w === "well" ? well : bad;
        const ms = pick(w === "well" ? wellMs : badMs);
        // spread milestones that share a month so each stays clickable
        const seen = new Map<number, number>();
        const dots = ms.map((m) => {
          const k = seen.get(m.t) ?? 0;
          seen.set(m.t, k + 1);
          return { m, cx: x(m.t) + k * 15, k };
        });
        return { w, f, s: summarize(f, h), dots, y: Y[w] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [well, bad, wellMs, badMs, h],
  );
  const ticks = [...new Set([0, Math.round(h / 4), Math.round(h / 2), Math.round((3 * h) / 4), h])];
  const selected = sel ? branches.find((b) => b.w === sel.which)?.dots[sel.i] : undefined;

  return (
    <div>
      <div className="-mx-2 overflow-x-auto px-2">
        <svg
          key={replay}
          viewBox={`0 0 ${W} ${H}`}
          className="wf-grid-bg block h-auto w-full min-w-[640px] rounded-2xl"
          role="img"
          aria-label={`Branching map: ${title}. If it goes well, savings reach ${cad(branches[0].s.balance)} by ${monthName(now, h)}. If it goes badly, ${cad(
            branches[1].s.balance,
          )}.`}
        >
          <defs>
            <radialGradient id="wf-node" cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#ffb37a" />
              <stop offset="55%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--wf-violet)" />
            </radialGradient>
            {(["well", "bad"] as const).map((w) => (
              <linearGradient key={w} id={`wf-branch-${w}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.9} />
                <stop offset="30%" stopColor={FUTURE[w].mark} />
                <stop offset="100%" stopColor={FUTURE[w].mark} />
              </linearGradient>
            ))}
            <filter id="wf-glow" x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* time axis between the branches */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={Y.well + 22} y2={Y.bad - 22} stroke="var(--grid)" strokeDasharray="2 6" />
              <text x={x(t)} y={H / 2 + 4} textAnchor="middle" fontSize="12" fill="var(--muted)">
                {t === 0 ? "Today" : monthName(now, t, true)}
              </text>
            </g>
          ))}

          {/* the two branches */}
          {branches.map((b, bi) => {
            const d = `M ${NODE.x + 40} ${NODE.y} C ${NODE.x + 130} ${NODE.y}, ${X0 - 110} ${b.y}, ${X0} ${b.y} L ${X1} ${b.y}`;
            return (
              <g key={b.w}>
                <path d={d} fill="none" stroke={FUTURE[b.w].mark} strokeOpacity={0.25} strokeWidth={14} filter="url(#wf-glow)" />
                <motion.path
                  d={d}
                  fill="none"
                  stroke={`url(#wf-branch-${b.w})`}
                  strokeWidth={4}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.4, delay: 0.35 + bi * 0.12, ease: [0.65, 0, 0.35, 1] }}
                />
                <motion.text
                  x={X0}
                  y={b.y + (b.w === "well" ? -30 : 42)}
                  fontSize="15"
                  fontWeight="700"
                  fill={FUTURE[b.w].ink}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9 }}
                >
                  {FUTURE[b.w].tag} · {FUTURE[b.w].name}
                </motion.text>

                {/* tip: balance at the horizon */}
                <motion.g initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.7 + bi * 0.12 }}>
                  <rect x={X1 + 6} y={b.y - 26} width={84} height={52} rx={14} fill="var(--surface)" stroke={FUTURE[b.w].mark} strokeOpacity={0.6} />
                  <text x={X1 + 48} y={b.y - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
                    savings
                  </text>
                  <text x={X1 + 48} y={b.y + 13} textAnchor="middle" fontSize="15" fontWeight="700" fill={b.s.balance < 0 ? "var(--critical-text)" : "var(--ink)"}>
                    {compactMoney(b.s.balance)}
                  </text>
                </motion.g>

                {/* milestones */}
                {b.dots.map(({ m, cx }, i) => {
                  const on = sel?.which === b.w && sel.i === i;
                  const fill = m.tone === "good" ? FUTURE[b.w].mark : m.tone === "bad" ? "var(--critical)" : "var(--surface)";
                  return (
                    <motion.g
                      key={`${m.kind}-${m.t}-${i}`}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 + ((cx - X0) / (X1 - X0)) * 1.2 + bi * 0.12, type: "spring", stiffness: 380, damping: 18 }}
                      style={{ transformBox: "fill-box", transformOrigin: "center" }}
                      className="cursor-pointer"
                      onClick={() => setSel(on ? null : { which: b.w, i })}
                      role="button"
                      tabIndex={0}
                      aria-label={`${monthName(now, m.t)}: ${m.title}. ${m.detail}`}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(on ? null : { which: b.w, i }))}
                    >
                      <circle cx={cx} cy={b.y} r={16} fill="transparent" />
                      {on && <circle cx={cx} cy={b.y} r={13} fill="none" stroke="var(--ink)" strokeWidth={2} />}
                      <circle cx={cx} cy={b.y} r={m.kind === "goal" ? 8 : 6.5} fill={fill} stroke={m.tone === "neutral" ? FUTURE[b.w].mark : "var(--surface)"} strokeWidth={2} />
                      {m.kind === "goal" && <circle cx={cx} cy={b.y} r={2.5} fill="var(--surface)" />}
                    </motion.g>
                  );
                })}
              </g>
            );
          })}

          {/* the decision */}
          <circle cx={NODE.x} cy={NODE.y} r={58} fill="var(--accent)" className="wf-pulse" opacity={0.4} />
          <motion.g
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <circle cx={NODE.x} cy={NODE.y} r={44} fill="url(#wf-node)" stroke="rgba(255,255,255,.35)" strokeWidth={1.5} />
            <foreignObject x={NODE.x - 16} y={NODE.y - 24} width={32} height={32}>
              <Icon className="size-8 text-white" aria-hidden />
            </foreignObject>
            <text x={NODE.x} y={NODE.y + 22} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
              WHAT IF
            </text>
          </motion.g>
          <text x={NODE.x} y={NODE.y + 72} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ink)">
            {title.length > 22 ? title.slice(0, 21) + "…" : title}
          </text>
        </svg>
      </div>

      {/* milestone detail */}
      <div className="mt-3 min-h-[64px]">
        <AnimatePresence mode="wait">
          {selected && sel ? (
            <motion.div
              key={`${sel.which}-${sel.i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`wf-card ${FUTURE[sel.which].card} flex items-start gap-3 px-4 py-3`}
            >
              <FutureDot which={sel.which} />
              <div className="min-w-0">
                <div className="text-xs font-semibold" style={{ color: FUTURE[sel.which].ink }}>
                  {FUTURE[sel.which].name} · {monthName(now, selected.m.t)}
                </div>
                <div className="font-semibold">{selected.m.title}</div>
                <div className="text-sm text-ink-2">
                  {selected.m.detail}. Savings that month: {cad(branches.find((b) => b.w === sel.which)!.f.points[selected.m.t].balance)}.
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 py-2 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <MousePointerClick className="size-4" aria-hidden /> Click a milestone to see what happens
              </span>
              <Key fill="var(--wf-well)" label="Good news" />
              <Key fill="var(--critical)" label="Cost or setback" />
              <Key fill="var(--surface)" stroke="var(--ink-2)" label="Event" />
              <Key fill="var(--wf-well)" ring label="Goal reached" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Key({ fill, stroke, label, ring }: { fill: string; stroke?: string; label: string; ring?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="14" height="14" aria-hidden>
        <circle cx="7" cy="7" r={ring ? 6 : 5} fill={fill} stroke={stroke ?? "var(--surface)"} strokeWidth="1.5" />
        {ring && <circle cx="7" cy="7" r="2" fill="var(--surface)" />}
      </svg>
      {label}
    </span>
  );
}

function compactMoney(v: number) {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}K` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`;
  return `${v < 0 ? "−" : ""}$${s}`;
}
