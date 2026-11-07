"use client";

import { useState, type ReactNode } from "react";

const DEFS = [
  ["I", "Typical monthly money in", "Median of money_in"],
  ["F", "Typical fixed costs", "Median of household_bills + insurance + loan_payments"],
  ["S", "Typical monthly spending", "Median of money_out"],
  ["B", "Buffer", "Mean of avg_daily_balance over the account's last 6 months"],
  ["H", "Household bills", "Median of household_bills (rent & utility shocks scale this)"],
  ["P", "Loan payment", "monthly_payment if the loan is still running at end of 2025 (status C or D), else 0"],
];

const SOURCES = [
  ["PKDD'99 Discovery Challenge Financial dataset (CTU Prague Relational Dataset Repository)", "https://relational.fel.cvut.cz/dataset/Financial"],
  ["Government of Canada: EI regular benefits, how much you could receive (2026: 55%, max $729/week)", "https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit/benefit-amount.html"],
  ["Government of Canada: EI regular benefits overview", "https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html"],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const TABS: { label: string; body: ReactNode }[] = [
  {
    label: "Definitions",
    body: (
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <Section title="1. Definitions (exactly the judges')">
          <table className="mt-3 w-full text-sm">
            <tbody>
              {DEFS.map(([k, name, def]) => (
                <tr key={k} className="border-b border-line align-top">
                  <td className="py-2 pr-3 font-mono text-accent-ink">{k}</td>
                  <td className="py-2 pr-3 font-medium">{name}</td>
                  <td className="py-2 text-ink-2">{def}</td>
                </tr>
              ))}
            </tbody>
          </table>

        </Section>
        <div className="space-y-6">
          <pre className="mt-0 overflow-x-auto rounded-xl bg-surface-2 p-4 text-xs leading-relaxed">{`buffer_left = B − one_off_costs
gap         = spending_after_shock − income_after_shock
if buffer_left <= 0:  runway = 0
elif gap <= 0:        runway = "no shortfall (120+)"
else:                 runway = min(buffer_left / gap, 120), rounded to 1 decimal`}</pre>
          <Section title="2. Verified, not hoped">
          <p className="mt-2 text-ink-2">
            A Python reference engine (pandas, the judges&apos; definitions verbatim) and the in-browser TypeScript engine are compared on{" "}
            <b className="text-ink">36,000 cases</b>: all 4,500 accounts × the brief&apos;s three example twists, a no-shock baseline and four random
            mixes of shocks. <b className="text-ink">Zero mismatches</b> to one decimal, including Python&apos;s round-half-to-even and the edge cases
            (14 accounts with no income, 77 with no spending, 23 with a negative buffer).
          </p>
          </Section>
        </div>
      </div>
    ),
  },
  {
    label: "Realistic mode",
    body: (
      <Section title="3. Where we differ, and why (Realistic mode)">
        <ul className="mt-3 list-disc space-y-3 pl-5 text-ink-2">
          <li>
            <b className="text-ink">EI is capped.</b> EI pays 55% of insurable earnings up to $729/week in 2026 (≈ $3,159/month). The brief applies 55% to all
            income with no cap, which overstates what high earners would receive.
          </li>
          <li>
            <b className="text-ink">Pensions don&apos;t stop.</b> A job loss shouldn&apos;t cut pension income, so Realistic mode applies EI only to non-pension
            income (median of money_in − pension_in) and keeps the median pension.
          </li>
          <li>Judge mode is the default and matches the brief exactly. Both numbers are always on screen.</li>
        </ul>
      </Section>
    ),
  },
  {
    label: "Plans",
    body: (
      <Section title="4. Plans">
        <ul className="mt-3 list-disc space-y-3 pl-5 text-ink-2">
          <li>
            <b className="text-ink">Goal plan.</b> Emergency-fund target = the larger of (a) 6 × the monthly gap after a job loss with EI, so the buffer survives
            a full 6-month EI claim, and (b) 3 × fixed costs. The customer saves a chosen share of their monthly surplus (I − S). If they have no surplus, we
            size the cut to flexible spending that creates one.
          </li>
          <li>
            <b className="text-ink">Backup plan.</b> Ordered moves on the day the shock hits: file for EI, trim flexible spending (card spending, cash withdrawals,
            unlabelled transfers out) by 10%, ask to defer the loan payment, then survival mode (25% cut). Cuts apply only while the shock lasts. Each step shows the runway it adds.
          </li>
        </ul>
      </Section>
    ),
  },
  {
    label: "Findings & sources",
    body: (
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <Section title="5. Findings method">
          <ul className="mt-3 list-disc space-y-3 pl-5 text-ink-2">
            <li>Income tenths and fifths are rank-based cuts of I across all 4,500 accounts. &quot;Months saved&quot; = B ÷ S.</li>
            <li>
              Early-warning signals use only months <i>before</i> each loan started, to avoid leakage. (Overdrafts after a loan are a symptom of default,
              not a predictor.) Income volatility = std ÷ mean of monthly money in; AUC 0.71 for predicting default.
            </li>
            <li>Pensioners: accounts where pension is more than half of all money in.</li>
          </ul>
        </Section>
        <Section title="Sources">
          <ul className="mt-3 space-y-3 text-sm">
            {SOURCES.map(([label, href]) => (
              <li key={href}>
                <a className="text-accent-ink underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    ),
  },
];

export function MethodTabs() {
  const [i, setI] = useState(0);
  return (
    <div className="pt-4">
      <h1 className="text-3xl font-semibold tracking-tight">Method</h1>
      <p className="mt-2 max-w-3xl text-ink-2">
        Every number in the engine is computed from the bank&apos;s own monthly summaries. Nothing is a black box: each one fits in a sentence.
      </p>
      <div role="tablist" className="mt-5 flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-surface-2 p-1">
        {TABS.map((t, n) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={i === n}
            onClick={() => setI(n)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${i === n ? "bg-ink text-page" : "text-ink-2 hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-6 max-w-5xl">
        {TABS[i].body}
      </div>
    </div>
  );
}
