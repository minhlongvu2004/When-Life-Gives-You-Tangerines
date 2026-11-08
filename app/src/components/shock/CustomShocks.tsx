"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil, Play, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money, NO_SHOCK, scenario, type Metrics, type Mode, type Shock } from "@/lib/engine";
import { isShock, loadCustomShocks, newShockId, sameShock, saveCustomShocks, shockLabel, type CustomShock } from "@/lib/shocks";
import { addMonths, parseYM, ymString, type YM } from "@/lib/whatif/scenarios";
import { ShockControls } from "./ShockFields";

const months = (r: number | null) => (r === null ? "120+" : r.toFixed(1));

export function CustomShocks({
  m,
  mode,
  shock,
  start,
  now,
  onRun,
  bare,
}: {
  m: Metrics;
  mode: Mode;
  shock: Shock;
  start: string | null;
  now: YM;
  onRun: (s: Shock, start: string | null) => void;
  bare?: boolean;
}) {
  // only rendered in the browser (after account data loads), so storage is available here
  const [list, setList] = useState<CustomShock[]>(() => loadCustomShocks());
  const [editing, setEditing] = useState<CustomShock | "new" | null>(null);
  const [toast, setToast] = useState<{ text: string; id: string } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const persist = (next: CustomShock[]) => {
    setList(next);
    setSaveFailed(!saveCustomShocks(next));
  };

  const save = (c: CustomShock, run: boolean) => {
    const exists = list.some((x) => x.id === c.id);
    persist(exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]);
    setEditing(null);
    setToast({ text: exists ? `Updated “${c.name}”` : `Saved “${c.name}”`, id: c.id });
    if (run) onRun(c.shock, c.start);
  };

  return (
    <section className={bare ? "relative" : "glass-card relative overflow-hidden p-4 sm:p-5"} aria-labelledby="custom-title">
      {!bare && <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-violet-soft blur-3xl" />}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="custom-title" className={`flex items-center gap-2 font-semibold ${bare ? "text-sm" : "text-base"}`}>
            <Sparkles className="size-4 text-violet-ink" aria-hidden /> Create Your Own Shock
          </h2>
          <p className={bare ? "text-xs text-ink-2" : "text-sm text-ink-2"}>Combine any changes into a hypothetical scenario. Saved in this browser only.</p>
        </div>
        <button type="button" onClick={() => setEditing("new")} className={`btn btn-primary rounded-full ${bare ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}>
          <Plus className="size-4" aria-hidden /> Create Custom Shock
        </button>
      </div>
      {bare && list.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs text-muted">No custom shocks yet. The editor opens in a dialog, so this page stays in view.</p>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative mt-3 inline-flex items-center gap-2 rounded-full bg-good-soft px-3 py-1.5 text-sm font-medium text-good-text"
          >
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.05 }}>
              <Check className="size-4" aria-hidden />
            </motion.span>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
      {saveFailed && <p className="relative mt-2 text-xs text-critical-text">This browser isn&apos;t letting us save, so your shocks will be gone after a reload.</p>}

      {list.length > 0 && (
        <ul className={`relative mt-3 grid gap-2.5 ${bare ? "" : "sm:grid-cols-2"}`}>
          <AnimatePresence initial={false}>
            {list.map((c) => {
              const on = sameShock(c.shock, shock) && c.start === start;
              const r = scenario(m, c.shock, mode).runway;
              return (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className={`rounded-2xl border p-3 transition-shadow ${on ? "border-accent bg-accent-soft" : "border-glass-border bg-glass"} ${toast?.id === c.id ? "ring-2 ring-good" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      {c.description && <div className="line-clamp-2 text-xs text-ink-2">{c.description}</div>}
                      <div className="mt-1 text-[11px] text-muted">
                        {shockLabel(c.shock) || "No changes yet"} · {c.shock.durationMonths} mo{c.start ? ` · from ${c.start}` : ""}
                      </div>
                    </div>
                    <span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold" title="Judged runway with this shock">
                      {months(r)} mo
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => onRun(c.shock, c.start)} className="btn btn-primary rounded-full px-3 py-1 text-xs">
                      <Play className="size-3" aria-hidden /> Run simulation
                    </button>
                    <button type="button" onClick={() => setEditing(c)} className="btn btn-secondary rounded-full px-3 py-1 text-xs">
                      <Pencil className="size-3" aria-hidden /> Edit
                    </button>
                    {confirmDel === c.id ? (
                      <>
                        <button
                          type="button"
                          autoFocus
                          onClick={() => {
                            persist(list.filter((x) => x.id !== c.id));
                            setConfirmDel(null);
                          }}
                          className="btn btn-danger rounded-full px-3 py-1 text-xs"
                        >
                          <Trash2 className="size-3" aria-hidden /> Yes, delete
                        </button>
                        <button type="button" onClick={() => setConfirmDel(null)} className="btn btn-outline rounded-full px-3 py-1 text-xs">
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDel(c.id)} className="btn btn-danger rounded-full px-3 py-1 text-xs" aria-label={`Delete ${c.name}`}>
                        <Trash2 className="size-3" aria-hidden /> Delete
                      </button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {createPortal(
        <AnimatePresence>
          {editing && (
            <CustomShockDialog
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            m={m}
            mode={mode}
            now={now}
            onCancel={() => setEditing(null)}
            onSave={save}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </section>
  );
}

const EXAMPLE: Shock = { ...NO_SHOCK, incomePct: 0.55, billsPct: 0.15, extraMonthly: 200, oneOffAbs: 1500, durationMonths: 6 };

function CustomShockDialog({
  initial,
  m,
  mode,
  now,
  onCancel,
  onSave,
}: {
  initial: CustomShock | null;
  m: Metrics;
  mode: Mode;
  now: YM;
  onCancel: () => void;
  onSave: (c: CustomShock, run: boolean) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [shock, setShock] = useState<Shock>(initial?.shock ?? EXAMPLE);
  const [start, setStart] = useState<string>(initial?.start ?? "");
  const [tried, setTried] = useState(false);
  const opener = useRef<Element | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  });

  useEffect(() => {
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel.current();
      if (e.key === "Tab" && panel.current) {
        // keep keyboard focus inside the dialog
        const f = [...panel.current.querySelectorAll<HTMLElement>("button,input,textarea,[tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const sc = scenario(m, shock, mode);
  const nameErr = !name.trim() ? "Give your shock a name." : null;
  const startOk = start === "" || parseYM(start) !== null;
  const nothing = !isShock(shock);
  const submit = (run: boolean) => {
    setTried(true);
    if (nameErr || !startOk || nothing) return;
    onSave({ id: initial?.id ?? newShockId(), name: name.trim().slice(0, 60), description: description.trim().slice(0, 200), shock, start: start || null }, run);
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onCancel} aria-hidden />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-dialog-title"
        initial={{ y: 30, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 340 }}
        className="glass-card relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none bg-surface sm:rounded-b-[1.5rem]"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 id="custom-dialog-title" className="text-lg font-semibold">
              {initial ? "Edit custom shock" : "Create a custom shock"}
            </h3>
            <p className="text-xs text-ink-2">Combine any changes. Each effect counts once: bills change your household bills, extras add on top.</p>
          </div>
          <button type="button" onClick={onCancel} className="btn btn-outline ml-auto size-8 shrink-0 rounded-full p-0" aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-ink-2">Shock name</span>
              <input
                autoFocus
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Moving during a job loss"
                aria-invalid={tried && !!nameErr}
                className="glass-field mt-1 w-full px-3 py-2 text-sm"
              />
              {tried && nameErr && <span className="mt-1 block text-xs text-critical-text">{nameErr}</span>}
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-ink-2">
                Description <span className="font-normal text-muted">(optional)</span>
              </span>
              <textarea
                value={description}
                maxLength={200}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's happening, in your words"
                className="glass-field mt-1 w-full resize-none px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface-2/50 p-4">
            <ShockControls m={m} shock={shock} setShock={setShock} income={sc.income} />
            <label className="mt-4 block">
              <span className="text-sm font-medium text-ink-2">
                Starts <span className="font-normal text-muted">(optional)</span>
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="month"
                  value={start}
                  min={ymString(addMonths(now, 1))}
                  onChange={(e) => setStart(e.target.value)}
                  aria-invalid={!startOk}
                  className="glass-field px-3 py-1.5 text-sm"
                />
                {start && (
                  <button type="button" onClick={() => setStart("")} className="btn btn-outline rounded-full px-2.5 py-1 text-xs">
                    Clear
                  </button>
                )}
              </div>
              <span className="mt-1 block text-xs text-muted">Leave empty to start right after the data ends (Jan 2026). Only changes the dates on the projection.</span>
            </label>
          </div>

          {/* live preview with this customer's numbers */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-live="polite">
            <Mini label="Income" value={`${money(sc.income)}/mo`} />
            <Mini label="Spending" value={`${money(sc.spending)}/mo`} />
            <Mini label="One-off" value={money(sc.oneOff)} />
            <Mini label="Judged runway" value={`${months(sc.runway)} mo`} />
          </div>
          {tried && nothing && <p className="mt-2 text-xs text-critical-text">Change at least one value so the shock does something.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={() => setShock({ ...NO_SHOCK })} className="btn btn-outline rounded-full px-3 py-1.5 text-sm">
            <RotateCcw className="size-3.5" aria-hidden /> Reset to defaults
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => submit(false)} className="btn btn-secondary rounded-full px-4 py-1.5 text-sm">
              {initial ? "Save changes" : "Create shock"}
            </button>
            <button type="button" onClick={() => submit(true)} className="btn btn-primary rounded-full px-4 py-1.5 text-sm">
              <Play className="size-3.5" aria-hidden /> Save &amp; run simulation
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="tnum font-semibold">{value}</div>
    </div>
  );
}
