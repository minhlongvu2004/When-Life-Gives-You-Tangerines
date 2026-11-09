# 🍊 When Life Gives You Tangerines

**A financial resilience engine for real bank customers.** Sheridan Datathon 2026, Tangerine track “Resilience Rewired”.

Pick any `account_id` (or a `client_id`, which opens that person's account) and the engine will:

1. **Know the customer:** income (I), fixed costs (F), spending (S), savings buffer (B), household bills (H), loan payment (P) and months of runway, plus charts of their real history.
2. **Take a shock:** a job loss with EI, a bills or rent increase, a surprise repair, or any mix. Use sliders, one-click presets, or type the judge's twist card in plain English. Everything recalculates instantly, with a "show the math" panel.
3. **Make a plan:** an emergency-fund goal plan and a step-by-step backup plan, each built from the customer's own numbers and showing how many months of runway it adds.

## Biggest finding

> **The more you earn, the fewer months you can survive.**
> The top-earning fifth of customers keeps **1.8 months** of spending in the bank; the lowest-earning fifth keeps **8.9** (working-age customers).
> Under the brief's job-loss twist (EI = 55% of income), **70%** of top earners can't last 6 months. Apply the real 2026 EI cap ($729/week), and it's **99%**.

Supporting signal (no leakage, pre-loan months only): customers whose income swung the most before borrowing defaulted **6×** as often as the steadiest (23% vs 4%; AUC 0.71).

## Numbers you can trust

- **Judge definitions** are the default and match the brief exactly.
- A Python reference engine and the in-browser TypeScript engine agree on **36,000 cases** (4,500 accounts × 8 twists) to one decimal: `npm test`.
- **Realistic mode** (one click) applies the 2026 EI weekly maximum and keeps pension income during a job loss. Both numbers are always on screen.

## Run it

Prerequisites: Node 20+ and Python 3.10+ with pandas.

```bash
# 1. (optional) rebuild the data from the raw CSVs. Generated JSON is already committed.
python pipeline/build_data.py path/to/data      # folder with monthly_summary.csv etc.
python pipeline/build_client_map.py path/to/data  # client_id -> account lookup (so client IDs work too)

# 2. run the app
cd app
npm install
npm run build       # once, ahead of time (~30 s)
npm run serve       # serves the build at http://localhost:3000 (use this for live judging)
# or: npm run dev   # hot-reload dev server
npm test            # golden test, twist-card parser, real-account data tests

# 3. (optional) prove every committed number matches the raw CSVs (all 4,500 accounts)
python pipeline/verify_csv.py path/to/data
```

## Data integrity

- Every historical figure comes from the nine supplied CSVs (2020-01 to 2025-12). The data has no customer names, so accounts are only ever shown as `Account #<account_id>`.
- Each major metric has an "i" tooltip naming its source file, columns, formula, period and whether it is observed, derived, model-defined or hypothetical (`app/src/lib/provenance.ts`).
- Simulations (Shock Engine, What If, Climb the Ranks, Tangerine Pulse) start from the Dec 2025 snapshot and are labelled hypothetical. No financial value is random.
- The Resilience Score is an application-defined index, not an official Tangerine or credit-bureau score. Rank and Tangerine Pulse use the same score.

Deep link to a customer: `http://localhost:3000/?id=52783`

## Layout

```
pipeline/build_data.py   pandas: judge metrics, per-account series, findings, golden test cases
pipeline/engine_ref.py   reference runway formula (the judges', verbatim)
app/src/lib/engine.ts    in-browser engine: shocks, runway, verdict, goal & backup plans
app/src/lib/twist.ts     offline twist-card parser ("laid off, EI 55%, bills +15%")
app/src/components/      UI (Next.js, Tailwind, Recharts, Framer Motion)
docs/                    pitch, live-twist playbook, demo script, Devpost write-up
```

## Sources & credits

- **PKDD'99 Discovery Challenge Financial dataset** (real anonymized bank data), CTU Prague Relational Dataset Repository: https://relational.fel.cvut.cz/dataset/Financial
- **Government of Canada, EI regular benefits, benefit amount** (2026: 55% of insurable earnings, max $729/week; max insurable earnings $68,900): https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit/benefit-amount.html
- **Government of Canada, EI regular benefits overview:** https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html
