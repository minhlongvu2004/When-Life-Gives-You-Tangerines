"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Right-hand side panel for details that would otherwise push a page past the screen.
 * Rendered in a portal (outside the zoomed page area), closes on Escape or a click outside,
 * moves focus into itself on open and back to the opener on close.
 */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const cb = useRef(onClose);
  useEffect(() => {
    cb.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = requestAnimationFrame(() => closeBtn.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cb.current();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-[var(--overlay)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-line bg-surface text-ink shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-semibold">{title}</h3>
              <button ref={closeBtn} onClick={onClose} className="btn btn-outline size-8 rounded-full p-0" aria-label="Close">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** A pill that opens a Sheet. */
export function SheetButton({ label, icon, title, children, wide, small }: { label: string; icon?: ReactNode; title?: string; children: ReactNode; wide?: boolean; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`btn btn-secondary rounded-full ${small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"}`}>
        {icon}
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title ?? label} wide={wide}>
        {children}
      </Sheet>
    </>
  );
}
