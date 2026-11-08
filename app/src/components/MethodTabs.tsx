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
  ["Financial Consumer Agency of Canada: Setting up an emergency fund", "https://www.canada.ca/en/financial-consumer-agency/services/savings-investments/setting-up-emergency-funds.html"],
  ["Financial Consumer Agency of Canada: Losing your job", "https://www.canada.ca/en/financial-consumer-agency/services/losing-job.html"],
  ["Tangerine: How to build an emergency fund", "https://www.tangerine.ca/en/thejuice/save/how-to-build-an-emergency-fund-during-a-time-of-high-inflation"],
  ["Statistics Canada: Consumer Price Index, December 2025 (rent +4.9% year over year)", "https://www150.statcan.gc.ca/n1/daily-quotidien/260119/dq260119b-eng.htm"],
  ["RBC Economics: Canada's population downturn, rising supply to keep apartment rents in check", "https://www.rbc.com/en/economics/canadian-analysis/featured-analysis/insights/canadas-population-downturn-rising-supply-to-keep-apartment-rents-in-check/"],
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
          <li>
            <b className="text-ink">Rent and bills slider range.</b> It goes up to 100% of the customer&apos;s usual bills (bills doubling). Typical increases are far
            smaller: Statistics Canada&apos;s rent index rose 4.3% to 5.2% a year through 2025, and RBC found units that changed tenants rose about 8.7%. In this
            dataset the median year-over-year change in household bills is 0%, but the top 1% of changes are +100% or more. The slider gives the small, realistic
            increases more room, and you can type any amount, even above the slider&apos;s end.
          </li>
        </ul>
      </Section>
    ),
  },
  {
    label: "Plans",
    body: (
      <Section title="4. Recovery plan">
        <ul className="mt-3 list-disc space-y-2.5 pl-5 text-ink-2">
          <li>
            <b className="text-ink">What it shows.</b> A month-by-month projection of one account: first the what-if (Phase 1), then the rebuild (Phase 2). Money available never goes below $0.
            Anything the account can&apos;t cover is shown separately as &quot;uncovered&quot;, since it would have to be borrowed, delayed or cut.
          </li>
          <li>
            <b className="text-ink">The plans.</b> Spend 10%, 15% or 25% less on card, cash and other transfers (treated as spending that could be trimmed, which is an assumption), and
            optionally ask the lender to defer a loan payment. A deferral is up to the lender. We assume the missed payments are repaid over 12 months, with no interest added.
          </li>
          <li>
            <b className="text-ink">Recovered means three things.</b> The monthly shortfall ends; anything uncovered is cleared and the account is back above one month of essentials; and the
            buffer reaches 3 months (or 6, as a stretch) of essentials we can see: bills, insurance and loan payments labelled in the account, or all spending if none are labelled.
            The 3 to 6 month range follows the Financial Consumer Agency of Canada and Tangerine.
          </li>
          <li>
            <b className="text-ink">The rebuild.</b> After the what-if, income and spending return to normal and any cuts stop. Half of each month&apos;s leftover goes first to anything uncovered,
            then to the buffer. Nothing is saved in a month with a shortfall, and no dollar is counted twice.
          </li>
          <li>
            <b className="text-ink">What the dates mean.</b> They are projected from the account&apos;s records, not progress so far, and rounded on purpose. The what-if switches show how far they
            move. They are illustrative, not statistical ranges.
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
      {/* All four panels sit in the same grid cell and only the selected one is visible, so the area is always as tall
          as the tallest tab (at any screen width). The page never resizes or jumps when you switch tabs. */}
      <div className="mt-6 grid max-w-5xl">
        {TABS.map((t, n) => (
          <div
            key={t.label}
            role="tabpanel"
            aria-label={t.label}
            aria-hidden={i !== n}
            inert={i !== n}
            className={`[grid-area:1/1] ${i === n ? "" : "invisible"}`}
          >
            {t.body}
          </div>
        ))}
      </div>
    </div>
  );
}
