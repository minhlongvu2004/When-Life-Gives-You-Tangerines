"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Engine" },
  { href: "/finding", label: "Finding" },
  { href: "/method", label: "Method" },
];

export function TangerineMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="18" r="12" fill="var(--series-2)" />
      <circle cx="12" cy="14" r="3" fill="#fff" opacity=".25" />
      <path d="M16 6c0-2 1-3.5 3-4" stroke="#7a4a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M17 6c3-3 8-3 10-1-3 3-7 3-10 1z" fill="#2f9e44" />
    </svg>
  );
}

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-page/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <TangerineMark />
          <span className="hidden truncate text-[15px] font-semibold tracking-tight sm:inline">When Life Gives You Tangerines</span>
        </Link>
        <nav className="ml-auto flex gap-1 text-sm">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${active ? "bg-ink text-page" : "text-ink-2 hover:text-ink"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
