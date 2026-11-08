"use client";

import { Crown, Gem, Medal, Shield, Trophy, type LucideIcon } from "lucide-react";
import { useId } from "react";
import type { LeagueKey } from "@/lib/rank";

export const LEAGUE_STYLE: Record<LeagueKey, { name: string; light: string; mid: string; dark: string; ink: string; Icon: LucideIcon; blurb: string; message: string }> = {
  diamond: {
    name: "Diamond",
    light: "#cffafe",
    mid: "#22d3ee",
    dark: "#0e7490",
    ink: "var(--lg-diamond-ink)",
    Icon: Gem,
    blurb: "Top 5%",
    message: "Outstanding resilience. You're among the top 5% of ranked accounts.",
  },
  platinum: {
    name: "Platinum",
    light: "#f5f3ff",
    mid: "#a78bfa",
    dark: "#5b21b6",
    ink: "var(--lg-platinum-ink)",
    Icon: Crown,
    blurb: "Top 5–20%",
    message: "Strong resilience. You're in the top fifth of ranked accounts.",
  },
  gold: {
    name: "Gold",
    light: "#fef3c7",
    mid: "#f59e0b",
    dark: "#92400e",
    ink: "var(--lg-gold-ink)",
    Icon: Trophy,
    blurb: "Top 20–50%",
    message: "Established resilience. You're in the top half, with room to climb.",
  },
  silver: {
    name: "Silver",
    light: "#f8fafc",
    mid: "#94a3b8",
    dark: "#475569",
    ink: "var(--lg-silver-ink)",
    Icon: Medal,
    blurb: "Top 50–80%",
    message: "Developing resilience. You're between the top 50% and top 80% of ranked accounts.",
  },
  bronze: {
    name: "Bronze",
    light: "#ffedd5",
    mid: "#ea580c",
    dark: "#7c2d12",
    ink: "var(--lg-bronze-ink)",
    Icon: Shield,
    blurb: "Last 20%",
    message: "In the lowest-scoring 20% of ranked accounts, with the most room to grow.",
  },
};

/** League emblem: a faceted shield with the league's icon. Size in px. */
export function ResilienceBadge({ league, size = 160, label = true }: { league: LeagueKey; size?: number; label?: boolean }) {
  const s = LEAGUE_STYLE[league];
  const id = useId().replace(/:/g, "");
  const Icon = s.Icon;
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size * 1.1, filter: `drop-shadow(0 0 ${size / 8}px ${s.mid}88)` }}>
        <svg viewBox="0 0 100 110" width={size} height={size * 1.1} aria-hidden>
          <defs>
            <linearGradient id={`b-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={s.light} />
              <stop offset="45%" stopColor={s.mid} />
              <stop offset="100%" stopColor={s.dark} />
            </linearGradient>
            <linearGradient id={`i-${id}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={s.dark} />
              <stop offset="100%" stopColor={s.mid} />
            </linearGradient>
          </defs>
          {/* outer hexagonal shield */}
          <path d="M50 3 L93 26 L93 70 Q93 86 50 107 Q7 86 7 70 L7 26 Z" fill={`url(#b-${id})`} stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
          {/* inner face */}
          <path d="M50 14 L83 32 L83 68 Q83 80 50 96 Q17 80 17 68 L17 32 Z" fill={`url(#i-${id})`} stroke="rgba(255,255,255,.35)" strokeWidth="1" />
          {/* facets */}
          <path d="M50 14 L50 96 M17 32 L83 68 M83 32 L17 68" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
          {/* top highlight */}
          <path d="M50 14 L83 32 L50 40 L17 32 Z" fill="rgba(255,255,255,.18)" />
          {league === "diamond" && (
            <g fill="#fff">
              <path d="M88 10 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" opacity=".9" />
              <path d="M12 84 l1.4 3.4 l3.4 1.4 l-3.4 1.4 l-1.4 3.4 l-1.4 -3.4 l-3.4 -1.4 l3.4 -1.4 Z" opacity=".7" />
            </g>
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center" style={{ paddingBottom: size * 0.08 }}>
          <Icon style={{ width: size * 0.34, height: size * 0.34, color: "#fff", filter: `drop-shadow(0 2px 6px ${s.dark})` }} aria-hidden strokeWidth={1.8} />
        </div>
      </div>
      {label && (
        <div className="mt-2 text-center">
          <div className="font-semibold tracking-tight" style={{ color: s.ink, fontSize: Math.max(13, size / 9) }}>
            {s.name} League
          </div>
        </div>
      )}
    </div>
  );
}

export function MiniBadge({ league }: { league: LeagueKey }) {
  const s = LEAGUE_STYLE[league];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `${s.mid}22`, color: s.ink, boxShadow: `inset 0 0 0 1px ${s.mid}55` }}
      title={`${s.name} League`}
    >
      <s.Icon className="size-3" aria-hidden /> {s.name}
    </span>
  );
}
