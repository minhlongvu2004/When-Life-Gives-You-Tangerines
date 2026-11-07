# Tangerine Resilience Engine — Design

Sheridan Datathon 2026, Tangerine track "Resilience Rewired". Draft due 2026-11-07 20:00, final 2026-11-08 12:00.

## Goal

A Streamlit app that a judge can drive live: pick any `account_id`, read a twist card, and get (1) the customer's profile, (2) their runway after the shock, and (3) a goal plan plus a backup plan, all from that customer's own numbers.

The engine shows two runways side by side:

- **Official runway**: the judges' published formula, reproduced exactly so live numbers match their answer sheet.
- **Realistic runway**: a month-by-month simulation that adds what the static formula misses. The gap between the two is the headline finding.

## Agreed decisions

- Format: Streamlit app (user choice).
- Definitions: show both official and realistic runway (user choice).
- Repo: `Datathon Datasets/tangerine-resilience/`. Data stays out of git and is read from a configurable path, default `../Datasets/Datasets/Tangerine/data`, override with env var `TANGERINE_DATA`.

## Evidence the design rests on

Checked on the full data on 2026-11-07:

- Spending (per-account ratio to own median) peaks in January (1.78x) and June (1.50x), every year 2021-2025, in 75% of accounts. The excess is almost all `cash_withdrawals_genuine`.
- Income peaks in June (1.34x) and December (1.30x), consistent with holiday and year-end bonuses.
- Static job-loss runway (EI 55%) vs loan default: runway 3 months or less → 25.2% default (n=147); 3-6 → 9.1% (n=307); 6-12 → 4.7% (n=170); over 12 → 5.2% (n=58).
- 3,315 accounts have no shortfall at baseline; 834 of them fall below 6 months under job loss + bills +15%.
- 16.4% of accounts get over half their income from pensions.
- 448 loans run past 2025-12-31 (403 status C, 45 status D).
- `days_below_zero > 0` coincides with default 100% of the time (likely a consequence of default, not a predictor). Reported as a limitation, not used as a feature.
- The data is the PKDD'99 Czech bank dataset, relabelled as CAD and shifted to 2020-2025 (district names are Czech).

## Components

All logic is pure functions in the `resilience/` package. `app.py` only handles the UI.

### `resilience/config.py`
Data path resolution, EI constants (replacement rate 55%, weekly maximum, source URL), the realism defaults, and the population shrinkage constant. The EI weekly maximum is checked against canada.ca during implementation and recorded with its source.

### `resilience/data.py`
- `load_tables(path) -> dict[str, DataFrame]`: reads the 9 CSVs (`partner_bank` as text).
- `build_profiles(tables) -> DataFrame`, indexed by `account_id`, with:
  - Official inputs: `I`, `F`, `S`, `B`, `H`, `P` exactly as the track README defines them.
  - Extra inputs: median `insurance`, median discretionary spending `D` (= `card_withdrawals + cash_withdrawals_genuine + transfers_out_other`), median pension income, `pension_share`, loan end month and status, district name, number of months of history, owner age at 2025-12-31.
  - Seasonal factors `season_in[1..12]` and `season_out[1..12]`: the account's calendar-month median divided by its overall median, shrunk toward the population factor with weight n/(n+3) (n = number of observations for that month), clipped to [0.25, 4]. If the account's overall median is 0, the population factor is used.
- The profile table is cached to `cache/profiles.parquet`, rebuilt when a source CSV is newer. The app wraps it in `st.cache_data`.

### `resilience/official.py`
- `official_inputs(profile_row)` returns I, F, S, B, H, P.
- `runway(buffer_left, gap) -> float`: 0 if `buffer_left <= 0`; 120 if `gap <= 0` (shown as "no shortfall (120+)"); else `min(buffer_left / gap, 120)`; rounded to 1 decimal.
- `official_runway(profile_row, shock)`: applies the shock statically. Income = `ei_rate × I` when job loss is on (otherwise I); spending = `S + bills_pct × H + extra_monthly`; `buffer_left = B - one_off`.

### `resilience/shocks.py`
- `Shock` dataclass: `job_loss: bool`, `ei_rate: float = 0.55`, `ei_months: int = 6`, `bills_pct: float = 0`, `extra_monthly: float = 0`, `one_off: float = 0` (dollars), `one_off_months_of_spending: float = 0` (converted to dollars using S), `start_month: int` (1-12, default current calendar month).
- `TWIST_PRESETS`: the three README examples: laid off on EI 55% for 6 months; furnace repair = 1 month of S; job loss on EI 55% + household bills +15%.

### `resilience/realistic.py`
`simulate(profile_row, shock, toggles) -> SimResult` steps month by month from calendar month `start_month` of 2026 (the month after the data ends), for up to 120 months. Loan end months are converted to months from that start date:

- Starting balance = `B - one_off`.
- Income per month:
  - Not laid off: `I × season_in[m]` (seasonality toggle) or `I`.
  - Laid off, during EI months: pension part kept (pension toggle) + EI on the non-pension part = `min(ei_rate × non_pension_I, EI monthly cap)` (EI cap toggle).
  - Laid off, after EI ends: pension part only (EI duration toggle). With the toggle off, EI continues indefinitely, as in the official formula.
- Spending per month: `S × season_out[m]` (seasonality toggle) or `S`, plus `bills_pct × H + extra_monthly`, minus `P` after the loan's end month (loan payoff toggle).
- Runway = the fractional month at which the balance first goes below zero (linear within the month), capped at 120. 0 if the starting balance is 0 or less.
- Returns the monthly balance path and the runway.

**Invariant:** with every toggle off, `simulate` returns the same runway as `official_runway` (to 1 decimal). A test enforces this.

`runway_bridge(profile_row, shock)` turns the toggles on one at a time (seasonality → EI cap → EI ends → pension kept → loan payoff) and returns the runway after each step. The app shows this as the explanation for official vs realistic.

### `resilience/plan.py`
- **Goal plan** (no shock): essential monthly costs `E = F`. Target emergency fund = `k × E`, k in {3, 6} (user picks). Monthly surplus = `I - S`. Suggested saving = 50% of a positive surplus. If the surplus is 0 or less, suggest the discretionary cut needed to free up 10% of income, capped at `D`. Output: target, gap to target (`target - B`, floor 0), monthly saving, months to goal.
- **Backup plan** (under the current shock): target runway `T` = EI months + 3 (default; adjustable). Required monthly cut `c = spending_after_shock - income_after_shock - buffer_left / T`, floored at 0. Cuts are applied in order (other transfers out, then cash withdrawals, then card), each capped at its own median. Output: the cut per lever, the resulting runway, and whether `D` alone is enough. If it isn't, list the remaining shortfall and the next steps (ask the lender to defer the loan payment `P`, apply for EI within the first 4 weeks).

### `resilience/insights.py`
Population-level findings for the Findings tab, each returned as a small DataFrame:
- Default rate by static job-loss runway band, with counts and Wilson 95% intervals.
- Seasonal spending and income factors by calendar month.
- The "hidden fragile" count: no shortfall at baseline but under 6 months after job loss + bills +15%.
- Official vs realistic runway across all accounts for a January vs July job loss: the distribution and the number of accounts that cross the 3- and 6-month lines.
- Share of accounts that are pension-dominant, and share where the EI cap applies.

### `app.py` (Streamlit)
- **Engine tab**:
  - Account selector (number input plus a dropdown of example accounts).
  - "Know the customer" metric cards: I, F, S, B, months of runway at baseline.
  - Shock panel: twist preset buttons plus sliders/inputs for every `Shock` field.
  - Result: official and realistic runway side by side, the bridge chart, the balance-path chart (Altair), and the goal and backup plans as short sentences with numbers.
- **Findings tab**: the insights charts with one-sentence captions.
- **Method & limits tab**: definitions, data origin, leakage note, and outside sources (StatCan, canada.ca EI).

## Error handling

- Unknown `account_id`: a warning, nothing computed.
- `I = 0`, `S = 0` or `B ≤ 0`: follow the official formula rules (runway 0 if `buffer_left ≤ 0`).
- Missing district values (district 69): shown as "n/a".

## Testing (pytest)

1. `official.runway` hand cases: buffer ≤ 0 → 0; gap ≤ 0 → 120; normal case; cap at 120; rounding.
2. `build_profiles` cross-check: for 25 random accounts, recompute I, F, S, B, H, P independently in the test with plain pandas and compare.
3. Twist presets: official runway for 3 fixed accounts per preset matches the hand formula.
4. Invariant: realistic with all toggles off equals official for 200 random accounts and all 3 presets.
5. Plan: the backup plan's cut produces a runway ≥ T when `D` is enough; cuts never exceed lever medians.
6. App smoke test: `streamlit.testing.v1.AppTest` loads the app and runs one account and one preset without exceptions.

## Deliverables beyond the app

- `README.md`: question, method, findings, how to run, data credits (PKDD'99 / CTU Prague, StatCan, canada.ca).
- `requirements.txt`: pandas, numpy, streamlit, altair, pyarrow, pytest.

## Out of scope

Natural-language twist parsing (Gemini), ML default models, deployment. These can be added if time allows after the core is tested.
