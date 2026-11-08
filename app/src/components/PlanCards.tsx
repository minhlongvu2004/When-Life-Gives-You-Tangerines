"use client";

import { motion } from "framer-motion";
import { Briefcase, CreditCard, Landmark, Minus, PiggyBank, Receipt, Scissors, X, Zap, type LucideIcon } from "lucide-react";
import { money, pct, type Shock } from "@/lib/engine";
import type { ActionIcon, CardState, PlanCard, PlanCards } from "@/lib/planCards";
import { shockLabel } from "@/lib/shocks";

const ICONS: Record<ActionIcon, LucideIcon> = {
  cut: Scissors,
  trim: Scissors,
  loan: Landmark,
  save: PiggyBank,
  receipt: Receipt,
  card: CreditCard,
};

type Kind = "nothing" | "short" | "long";

const KIND = {
  nothing: {
    tag: "Do nothing",
    card: "border-2 border-dashed border-ink/20 bg-transparent",
    tagCls: "bg-surface-2 text-ink-2",
    label: "text-muted",
    act: "",
    em: "",
  },
  short: {
    tag: "Short term",
    card: "border-2 border-accent bg-surface shadow-[0_12px_32px_rgba(242,105,29,0.12)]",
    tagCls: "bg-accent-soft text-accent-ink",
    label: "text-accent-ink",
    act: "bg-accent-soft",
    em: "text-accent-ink",
  },
  long: {
    tag: "Long term",
    card: "border-2 border-s1 bg-surface shadow-[0_12px_32px_rgba(39,69,92,0.12)]",
    tagCls: "bg-s1-soft text-s1",
    label: "text-s1",
    act: "bg-s1-soft",
    em: "text-s1",
  },
} satisfies Record<Kind, Record<string, string>>;

const FILL: Record<CardState, string> = { ok: "bg-good", mid: "bg-warning", bad: "bg-critical", blocked: "bg-muted" };
const PILL: Record<CardState, string> = {
  ok: "",
  mid: "bg-warn-soft text-warn-text",
  bad: "bg-critical-soft text-critical-text",
  blocked: "",
};

/** The bar shows the runway against 1.5× the shock's duration; the dashed line marks the duration. */
const BAR_SPAN = 1.5;

const num = (r: number | null) => (r === null ? "120+" : r.toFixed(1));

/** "Cut card & cash spending to {amount}/mo" -> text with the amount highlighted. */
function Action({ kind, icon, text, amount }: { kind: Kind; icon: ActionIcon; text: string; amount?: string }) {
  const Icon = ICONS[icon];
  const [before, after = ""] = text.split("{amount}");
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[18px] leading-[1.3] font-semibold tracking-[-0.01em] ${KIND[kind].act}`}>
      <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        {before}
        {amount && <em className={`font-extrabold not-italic ${KIND[kind].em}`}>{amount}</em>}
        {after}
      </span>
    </div>
  );
}

export function PlanCardView({ kind, card, durationMonths }: { kind: Kind; card: PlanCard; durationMonths: number }) {
  const k = KIND[kind];
  const blocked = card.runway === undefined;
  const max = durationMonths * BAR_SPAN;
  const width = blocked ? 0 : card.runway === null ? 100 : Math.min(1, (card.runway as number) / max) * 100;
  const doLabel = kind === "nothing" ? "They do" : "Do this";
  return (
    <section
      className={`flex flex-col rounded-[28px] px-[22px] pt-[22px] pb-5 text-left md:row-span-4 md:grid md:grid-rows-subgrid md:content-start ${k.card}`}
    >
      {/* row 1: header */}
      <div className="flex flex-col items-start gap-2">
        <span className={`rounded-full px-3 py-[5px] text-xs font-extrabold tracking-[0.08em] whitespace-nowrap uppercase ${k.tagCls}`}>{k.tag}</span>
        <span className="text-[15px] font-semibold text-ink">
          <b className="font-extrabold">{card.timing}</b>
          {card.timingNote && <> · {card.timingNote}</>}
        </span>
      </div>

      {/* row 2: label */}
      <div className={`mt-[18px] text-xs font-extrabold tracking-[0.08em] uppercase ${k.label}`}>{doLabel}</div>

      {/* row 3: actions */}
      <div className="mt-2.5 mb-4 grid content-start gap-2.5">
        {card.actions.length ? (
          card.actions.map((a, i) => <Action key={i} kind={kind} {...a} />)
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-base leading-[1.3] font-semibold text-ink-2">
            <span className="grid size-[38px] flex-none place-items-center text-muted">
              <Minus className="size-5" aria-hidden />
            </span>
            <span>{card.empty}</span>
          </div>
        )}
      </div>

      {/* row 4: result */}
      <div className="border-t border-line pt-3.5">
        {blocked ? (
          <>
            <div className="text-xs font-bold tracking-[0.06em] text-muted uppercase">Result</div>
            <div className="mt-1.5 flex items-center gap-2 text-[34px] leading-none font-extrabold tracking-[-0.03em] text-critical-text">
              <X className="size-8" aria-hidden /> Can&apos;t save yet
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-bold tracking-[0.06em] text-muted uppercase">Result: savings last</div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className={`tnum text-[44px] leading-none font-extrabold tracking-[-0.055em] ${kind === "nothing" ? "text-muted" : "text-ink"}`}>
                {num(card.runway as number | null)}
                <small className="ml-1 text-base leading-none font-semibold tracking-normal text-ink-2">months</small>
              </div>
              {card.pill && <span className={`rounded-full px-[13px] py-[5px] text-[13px] font-semibold ${PILL[card.state]}`}>{card.pill}</span>}
            </div>
            <div className="relative mt-3.5 h-2 rounded-full bg-surface-2">
              <motion.i
                className={`absolute inset-y-0 left-0 rounded-full ${kind === "nothing" ? "bg-muted/60" : FILL[card.state]}`}
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
              />
              <span className="absolute -top-1.5 -bottom-1.5 border-l-[2.5px] border-dashed border-ink" style={{ left: `${(durationMonths / max) * 100}%` }} />
            </div>
            <div className="mt-[5px] text-right text-[11.5px] text-muted">needs {durationMonths} months</div>
          </>
        )}
      </div>
    </section>
  );
}

const Pill = ({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm ${
      dark ? "border-ink bg-ink font-semibold text-page" : "border-line bg-surface text-ink-2"
    }`}
  >
    {children}
  </span>
);
const B = ({ children }: { children: React.ReactNode }) => <b className="font-extrabold text-ink">{children}</b>;

/** One line that says what the shock is, so the three cards read as answers to one question. */
export function ShockStrip({ shock, cards }: { shock: Shock; cards: PlanCards }) {
  const noEi = shock.jobLoss && shock.incomePct === 0;
  const Icon = shock.jobLoss ? Briefcase : Zap;
  // the engine's income note says "EI capped at $3,159/mo" in realistic mode; otherwise show the plain share
  const eiNote = cards.incomeNote.startsWith("EI capped") ? cards.incomeNote.split(" + ")[0] : `${pct(shock.incomePct)} of income`;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
      <Pill dark>
        <Icon className="size-4" aria-hidden />
        {shock.jobLoss ? "Job lost" : shockLabel(shock)}
      </Pill>
      {shock.jobLoss && (noEi ? <Pill>No EI</Pill> : (
        <Pill>
          EI pays <B>{money(cards.income)}</B> a month ({eiNote})
        </Pill>
      ))}
      {shock.jobLoss && (
        <Pill>
          for <B>{shock.durationMonths} months</B>
        </Pill>
      )}
      {shock.jobLoss && shock.billsPct !== 0 && (
        <Pill>
          Bills {shock.billsPct > 0 ? "up" : "down"} <B>{pct(Math.abs(shock.billsPct))}</B>
        </Pill>
      )}
      {cards.oneOff > 0 && (
        <Pill>
          Costs <B>{money(cards.oneOff)}</B>
        </Pill>
      )}
    </div>
  );
}
