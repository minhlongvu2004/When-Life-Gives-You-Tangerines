"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Never shrink below this, so text stays readable. Below it the page scrolls instead. */
const MIN_SCALE = 0.85;
/** On large monitors, grow up to this much so the page fills the screen. */
const MAX_SCALE = 1.3;

/**
 * Scales its content (CSS zoom) so the page fits the visible height with no scrolling.
 * Content is centred vertically. If it would need to shrink below MIN_SCALE, it stops
 * shrinking and the area scrolls, so fonts never become unreadable.
 */
export function FitToScreen({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const prev = i.style.zoom;
      i.style.zoom = "1";
      const natural = i.offsetHeight; // height at 100%, read synchronously so nothing is painted
      i.style.zoom = prev;
      const next = natural > 0 ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, (o.clientHeight - 4) / natural)) : 1;
      setScale((cur) => (Math.abs(cur - next) < 0.005 ? cur : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    const mo = new MutationObserver(measure); // content swaps (steps, data loading)
    mo.observe(i, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", measure);
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div ref={outer} className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <div ref={inner} style={{ zoom: scale }} className="mx-auto my-auto w-full max-w-6xl px-4 pb-2 sm:px-6">
        {children}
      </div>
    </div>
  );
}
