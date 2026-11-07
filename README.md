# When Life Gives You Tangerines: a resilience engine

Sheridan Datathon 2026 · Tangerine track "Resilience Rewired"

## The question

When a Tangerine customer loses their job or gets hit with a big bill, **how long can they really last**, and what should they do about it?

The track gives a formula for "runway" (buffer ÷ monthly shortfall). It uses medians, so it assumes every month looks the same. We asked whether that holds up against each customer's own month-by-month history.

## What the engine does

A Streamlit app with three steps for any `account_id`:

1. **Know the customer.** Typical income (I), fixed costs (F), spending (S), savings buffer (B), runway today, and 24 months of money in and out.
2. **Take a shock.** Twist presets (layoff on EI, furnace repair, layoff + bills +15%) or sliders for any mix, including the month the shock starts. It shows two numbers side by side:
   - **Official runway**: the judges' formula, reproduced exactly.
   - **Realistic runway**: a month-by-month simulation using the customer's own seasonal pattern, the 2026 EI cap ($729/week), EI ending after N months, pension income kept, and loan payments stopping when the loan ends.
   - A **bridge chart** shows how much each of those changes moves the number.
3. **Make a plan.** A goal plan (emergency fund of 3 or 6 months, funded from the customer's own surplus) and a backup plan (the smallest cut to cash, card and other transfers that keeps the *realistic* runway on target, plus what to do if cuts aren't enough).

## What we found

All numbers come from `resilience/insights.py` on the full data (4,500 accounts, 682 loans).

**1. The official formula overstates how long people last, and the month matters.**
For a layoff with EI at 55% for 6 months:

| | Median runway | Customers under 3 months | Under 6 months |
|---|---|---|---|
| Official formula | 8.6 months | 435 | 1,578 |
| Realistic, layoff in July | 5.7 months | 1,246 | 2,330 |
| Realistic, layoff in **January** | **5.0 months** | **1,552** | **2,579** |

The cause is seasonal. Income bumps 1.49× in June and December (bonuses). Spending spikes **1.78× in January** and 1.50× in June, almost all of it cash withdrawals. A January layoff lands right after the bonus is spent, in the most expensive month of the year. On top of that, the EI cap applies to 57% of customers: 55% of their income is more than EI will pay.

**2. Short runway predicts real loan defaults.** The runway number measures something real:

| Runway after a layoff (official) | Loans | Default rate (95% interval) |
|---|---|---|
| 3 months or less | 151 | **25.2%** (18.9–32.6%) |
| 3–6 months | 309 | 8.7% (6.1–12.4%) |
| 6–12 months | 165 | 4.8% (2.5–9.3%) |
| over 12 months | 57 | 5.3% (1.8–14.4%) |

**3. Many customers who look safe are fragile.** 3,315 customers earn more than they spend today. 825 of them fall under 6 months of runway if they lose their job and bills rise 15%.

Also: 16% of customers get most of their income from pensions, so a "job loss" twist doesn't fit them. The engine keeps their pension income.

## How to run

```bash
pip install -r requirements.txt
streamlit run app.py
python -m pytest
```

Data is not in the repo (`transactions.csv` is over GitHub's size limit). Put the track's CSVs in `data/`, or point `TANGERINE_DATA` at the folder. The first run builds `cache/profiles.parquet` in a few seconds.

## How it's built

| File | Job |
|---|---|
| `resilience/official.py` | The judges' formula: I, S, B, H, runway rules (0 floor, 120 cap, 1 decimal) |
| `resilience/data.py` | One profile per account, including shrunk seasonal factors |
| `resilience/realistic.py` | Month-by-month simulation and the bridge |
| `resilience/plan.py` | Goal plan and backup plan |
| `resilience/insights.py` | Population findings |
| `app.py` | Streamlit UI |

46 tests. Two matter most for the live demo:
- The official numbers are cross-checked against an independent calculation.
- With every realism adjustment switched off, the realistic engine returns exactly the official runway (200 accounts × 3 twists).

## Limits

- The data is the PKDD'99 Czech bank dataset (district names are Czech), relabelled in CAD and shifted to 2020–2025. The seasonal pattern (June and December bonuses) fits a Czech payroll calendar and may differ in Canada.
- About half of transactions have no purpose label, so "discretionary" spending (cash, card, other transfers) is an approximation.
- The realistic runway assumes past January and June cash spikes continue after a layoff. A careful customer could skip them, which is what the backup plan recommends.
- `days_below_zero > 0` lines up with default 100% of the time. It is almost certainly a consequence of default, so we don't use it to predict.
- Only 682 loans, so the default-rate bands have wide intervals (shown above).
- 1,124 accounts have no labelled bills (F = 0). Their emergency-fund target uses total spending instead.

## Sources

- PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository: https://relational.fel.cvut.cz/dataset/Financial
- EI 2026 maximum insurable earnings and weekly benefit ($729): https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-employers/premium-reduction-program/2026-maximum-insurable-earnings.html
- EI regular benefits: https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html
