"use client";

import { useId } from "react";
import { volumeToHeight } from "@/lib/pulse";

/**
 * 2D tangerine with the same volume-based fill as the 3D scene. Used when WebGL isn't available,
 * while the 3D scene loads, and for the small fruits in "Compare My Juice".
 */
export function TangerineFallback({ score, size = 260, label }: { score: number | null; size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const rx = 90;
  const ry = 78; // flattened, like the 3D fruit
  const cy = 112;
  const t = score === null ? 0 : volumeToHeight(score / 100);
  const top = cy + ry - t * 2 * ry; // y of the liquid surface
  return (
    <svg viewBox="0 0 200 210" width={size} height={size * 1.05} role="img" aria-label={label ?? (score === null ? "Empty tangerine" : `Tangerine ${Math.round(score)}% full`)}>
      <defs>
        <clipPath id={`c-${id}`}>
          <ellipse cx="100" cy={cy} rx={rx - 6} ry={ry - 6} />
        </clipPath>
        <radialGradient id={`p-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FFB347" stopOpacity=".55" />
          <stop offset="70%" stopColor="#FF8000" stopOpacity=".28" />
          <stop offset="100%" stopColor="#c25a00" stopOpacity=".85" />
        </radialGradient>
        <linearGradient id={`j-${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#d9560a" />
          <stop offset="100%" stopColor="#FF9B18" />
        </linearGradient>
        <radialGradient id={`g-${id}`}>
          <stop offset="0%" stopColor="#FF9B18" stopOpacity={0.15 + 0.35 * (score ?? 0) / 100} />
          <stop offset="100%" stopColor="#FF9B18" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy={cy} rx="100" ry="98" fill={`url(#g-${id})`} />
      <g clipPath={`url(#c-${id})`}>
        <rect x="0" y={top} width="200" height="210" fill={`url(#j-${id})`} style={{ transition: "y 1s cubic-bezier(.16,1,.3,1)" }} />
        <ellipse cx="100" cy={top} rx={rx} ry="5" fill="#FFB347" opacity={score === null || t <= 0 ? 0 : 0.9} style={{ transition: "cy 1s cubic-bezier(.16,1,.3,1)" }} />
      </g>
      <ellipse cx="100" cy={cy} rx={rx} ry={ry} fill={`url(#p-${id})`} stroke="#FF8000" strokeOpacity=".8" strokeWidth="2.5" />
      <ellipse cx="72" cy="78" rx="20" ry="11" fill="#fff" opacity=".18" transform="rotate(-25 72 78)" />
      <path d="M100 36 q2 -10 -2 -18" stroke="#6b4423" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M101 30 q26 -22 52 -8 q-24 18 -52 8z" fill="#2fa35a" />
      <path d="M98 31 q-20 -16 -40 -6 q18 14 40 6z" fill="#3c9a55" />
    </svg>
  );
}
