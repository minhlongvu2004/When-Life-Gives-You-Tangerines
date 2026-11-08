"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const WIDTH = 288;
const GAP = 8;
const EDGE = 12;

/**
 * A small circular "?" button. Hover or focus shows the explanation; a tap or click pins it open
 * (for touch screens). Escape, a second tap, or a tap elsewhere closes it. Always kept on screen.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; above: boolean } | null>(null);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const w = Math.min(WIDTH, vw - EDGE * 2);
    const cx = b.left + b.width / 2;
    const left = Math.min(Math.max(EDGE, cx - w / 2), vw - w - EDGE);
    const h = tip.current?.offsetHeight ?? 120;
    const above = b.bottom + GAP + h > window.innerHeight - EDGE && b.top - GAP - h > EDGE;
    setPos({ left, top: above ? b.top - GAP - h : b.bottom + GAP, arrow: cx - left, above });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const raf = requestAnimationFrame(place); // again once the tip's real height is known
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !tip.current?.contains(t)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, close]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`What does “${label}” mean?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          if (open && pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
        className="grid size-[18px] shrink-0 place-items-center rounded-full border border-glass-border bg-glass text-[11px] leading-none font-bold text-muted transition-colors hover:border-accent hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ?
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={tip}
                id={id}
                role="tooltip"
                initial={{ opacity: 0, y: pos?.above ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: Math.min(WIDTH, window.innerWidth - EDGE * 2) }}
                className="z-[60] rounded-xl border border-glass-border bg-glass-strong px-3.5 py-2.5 text-[13px] leading-relaxed text-ink shadow-xl backdrop-blur-xl"
              >
                <div className="mb-0.5 font-semibold">{label}</div>
                <div className="text-ink-2">{children}</div>
                <span
                  aria-hidden
                  className={`absolute size-2.5 rotate-45 border-glass-border bg-glass-strong ${pos?.above ? "-bottom-[6px] border-r border-b" : "-top-[6px] border-t border-l"}`}
                  style={{ left: (pos?.arrow ?? 0) - 5 }}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
