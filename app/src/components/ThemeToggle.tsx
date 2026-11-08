"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "theme";

function read(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** The current theme, kept in sync with html[data-theme] (for canvases and charts that need a value). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light");
}

function apply(t: Theme, fade: boolean) {
  const html = document.documentElement;
  if (fade && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    html.classList.add("theme-fade");
    window.setTimeout(() => html.classList.remove("theme-fade"), 350);
  }
  html.dataset.theme = t;
}

export function ThemeToggle() {
  const theme = useTheme();

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        apply(next, true);
        try {
          localStorage.setItem(KEY, next);
        } catch {}
      }}
      className="btn btn-secondary size-8 shrink-0 rounded-full p-0"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
