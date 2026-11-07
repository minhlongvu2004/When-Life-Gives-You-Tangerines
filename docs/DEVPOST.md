# Devpost submission: When Life Gives You Tangerines

**Tagline:** The more you earn, the fewer months you can survive. A financial resilience engine that proves it, one customer at a time.

## What it does

When Life Gives You Tangerines is a resilience engine for real bank customers. Enter any of 4,500 `account_id`s and it:

1. **Knows the customer.** It shows typical monthly income, fixed costs, spending, household bills, loan payment and savings buffer, along with runway in months, compared against peers in the same income band. Charts show their real money in and out and their balance history.
2. **Takes a shock.** Apply a job loss with EI, a bills or rent increase, a surprise repair, or any mix. You can use sliders, one-click presets, or type the twist card in plain English ("They lose their job (EI at 55%) and household bills go up 15%"). Runway, a "do they make it?" verdict, a month-by-month buffer chart and a "show the math" breakdown update instantly.
3. **Makes a plan.** A **goal plan** sizes a personal emergency fund that survives 6 months of EI and says how much to save each month and when it will be fully funded. A **backup plan** lists ordered moves for the day the shock hits (file EI, trim flexible spending, defer the loan, survival mode), each showing the runway it adds.

A one-click **Realistic mode** applies the real 2026 EI cap ($729/week) and keeps pension income through a job loss. Both numbers are always on screen.

## Our biggest finding

**The more you earn, the fewer months you can survive.** Across 4,500 accounts and 1,056,320 transactions:

- The top-earning fifth keeps **1.8 months** of their own spending as a buffer. The lowest-earning fifth keeps **8.9** (working-age customers). Buffers shrink steadily across every income tenth (9.0 → 1.6 months).
- Under the brief's job-loss twist (EI = 55% of income), **70%** of top earners can't last 6 months, against **4%** of the lowest earners.
- The brief's rule flatters high earners. Real EI pays 55% **up to $729/week**. With the cap, **99%** of top earners fail, and across all customers the failure rate rises from **35% to 51%**.
- The pattern holds with pensioners excluded (8.9 → 1.8 months).

**Early warning (no leakage):** using only months *before* each loan started, customers with the most volatile income defaulted **6×** as often as the steadiest (23% vs 4%, AUC 0.71). Overdrafts *look* like a perfect predictor, but they are a symptom of default, so we excluded them.

## How we built it

- **Python + pandas pipeline** computes the judges' definitions exactly for every account (medians, the last-6-month buffer, running-loan payments), plus per-account monthly series, the findings and 36,000 golden test cases.
- **Next.js + TypeScript + Tailwind + Recharts + Framer Motion** front end, exported as a static site. The engine runs entirely in the browser, so the live demo has no server, no API key and no network risk.
- **Golden test:** the TypeScript engine matches the Python reference on all 36,000 account × twist cases to one decimal, including Python's round-half-to-even and the edge cases (no income, no spending, negative buffer).
- **Twist-card parser:** deterministic and offline, so it turns judge language into slider settings.

## Challenges

- Matching the judges' numbers exactly. Floating-point rounding differs between Python and JavaScript, so we reimplemented Python's rounding and proved equality on every account.
- Avoiding a too-good-to-be-true result: overdrafts "predicted" 100% of defaults because they *are* the default. We rebuilt the analysis using only pre-loan data.
- Keeping advice honest: "flexible spending" is a heuristic (cash can hide rent), so backup cuts are modest (10%, then 25%).

## What we're proud of

A surprising, one-sentence finding that the live demo proves on the spot, and numbers a judge can verify line by line.

## What's next

Proactive nudges: flag customers with under 2 months of buffer and bumpy income *before* a layoff. Add more shock types (interest-rate resets, new baby), and calibrate household costs with StatCan CPI and CMHC rent data.

## Built with

python, pandas, numpy, typescript, next.js, react, tailwindcss, recharts, framer-motion, vitest

## Sources

- PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository: https://relational.fel.cvut.cz/dataset/Financial
- Government of Canada, EI regular benefits, how much you could receive: https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit/benefit-amount.html
- Government of Canada, EI regular benefits: https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html
