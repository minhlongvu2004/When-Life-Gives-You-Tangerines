"use client";

import type { ReactNode } from "react";
import { KIND_LABEL, PROV, type ProvKey, type ProvKind } from "@/lib/provenance";
import { InfoTip } from "./InfoTip";

const KIND_CLS: Record<ProvKind, string> = {
  observed: "bg-good-soft text-good-text",
  derived: "bg-accent-soft text-accent-ink",
  model: "bg-violet-soft text-violet-ink",
  hypothetical: "bg-warning-soft text-ink",
};

export function KindBadge({ kind }: { kind: ProvKind }) {
  return <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase ${KIND_CLS[kind]}`}>{KIND_LABEL[kind]}</span>;
}

/** "i" button: where a number comes from (dataset, columns, formula, period, observed/derived/hypothetical). */
export function ProvTip({ k, extra }: { k: ProvKey; extra?: ReactNode }) {
  const p = PROV[k];
  return (
    <InfoTip label={p.label} glyph="i" ariaLabel={`Where “${p.label}” comes from`}>
      <span className="mb-1.5 block">
        <KindBadge kind={p.kind} />
      </span>
      <dl className="space-y-1 text-[12px] leading-snug">
        <Row k="Source" v={p.source} mono />
        <Row k="Columns" v={p.columns} mono />
        <Row k="Formula" v={p.formula} />
        <Row k="Period" v={p.period} />
      </dl>
      {extra && <span className="mt-1.5 block border-t border-line pt-1.5 text-[12px]">{extra}</span>}
    </InfoTip>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[4.2rem_1fr] gap-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-ink ${mono ? "font-mono text-[11px] break-words" : ""}`}>{v}</dd>
    </div>
  );
}
