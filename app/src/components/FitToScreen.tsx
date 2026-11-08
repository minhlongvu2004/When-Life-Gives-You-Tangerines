"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Never shrink below this, so text stays readable. Below it the page scrolls instead. */
const MIN_SCALE = 0.85;
/** On large monitors, grow up to this much so the page fills the screen. */
const MAX_SCALE = 1.3;

/**
 * The main area under the header. Two modes, chosen by the page:
 *
 * - Zoom-to-fit (default): short pages (landing, findings, method) are scaled with CSS zoom so they
 *   fill the visible height. If they would need to shrink below MIN_SCALE, the area scrolls instead.
 * - Fill (`data-fill` anywhere inside): workspace pages (shock engine, What If, Rank, Pulse) take
 *   exactly the remaining viewport height on desktop (lg and up) and lay out their own columns, so the
 *   page itself never scrolls. Below lg they flow normally and the area scrolls, so nothing is clipped
 *   on small screens.
 */
export function FitToScreen({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fill, setFill] = useState(false);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const wantsFill = !!i.querySelector("[data-fill]");
      setFill(wantsFill);
      if (wantsFill || i.querySelector("[data-no-fit]")) {
        setScale(1);
        return;
      }
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
    <div ref={outer} id="app-main" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div
        ref={inner}
        style={{ zoom: fill ? 1 : scale }}
        className={fill ? "mx-auto w-full max-w-[1720px] px-3 pb-3 sm:px-5 lg:h-full lg:min-h-0" : "mx-auto my-auto w-full max-w-6xl px-4 pb-2 sm:px-6"}
      >
        {children}
      </div>
    </div>
  );
}
