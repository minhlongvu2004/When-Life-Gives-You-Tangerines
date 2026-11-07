# Tangerine Resilience Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Streamlit app that, for any `account_id` and twist, shows the customer profile, the judges' official runway next to a realistic month-by-month runway, and a goal plan plus a backup plan.

**Architecture:** Pure-function package `resilience/` (config, data, official, shocks, realistic, plan, insights) with pytest coverage, and a thin `app.py` Streamlit UI. Per-account profiles are built once from the CSVs and cached to parquet.

**Tech Stack:** Python 3.14, pandas, numpy, pyarrow, streamlit (with its bundled altair), pytest.

**Spec:** `docs/superpowers/specs/2026-11-07-tangerine-resilience-engine-design.md`

## Global Constraints

- Data path: env var `TANGERINE_DATA`, default `../Datasets/Datasets/Tangerine/data` relative to the repo root. Data is never committed.
- Official definitions are copied verbatim from the track README: I = median `money_in`; F = median `household_bills + insurance + loan_payments`; S = median `money_out`; B = mean `avg_daily_balance` over the account's last 6 rows sorted by month; H = median `household_bills`; P = `monthly_payment` if the loan is still running at end of 2025, else 0.
- Runway: 0 if `buffer_left <= 0`; 120 ("no shortfall (120+)") if `gap <= 0`; else `min(buffer_left / gap, 120)`; rounded to 1 decimal.
- Realistic simulation starts in calendar month `start_month` of 2026 and runs at most 120 months.
- Seasonal factors are shrunk toward the population with weight n/(n+3) and clipped to [0.25, 4].
- EI replacement rate 0.55; EI weekly maximum is a constant in `config.py` with its canada.ca source URL (verify the 2026 value in Task 1).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run all commands from the repo root `tangerine-resilience/`.

## Review Focus

1. A judge types an `account_id` that doesn't exist (or 0): the app shows a warning and computes nothing. Test in Task 6.
2. An account with no loan, or whose loan ended before the simulation starts: the simulation runs without errors and the loan-payoff step changes nothing. Test in Task 3.
3. Slider extremes (EI rate 0, EI months 0, bills +100%, a one-off bigger than the buffer): runway is a finite number in [0, 120] and nothing divides by zero. Test in Task 3.
4. The backup plan when the buffer after the one-off is already 0 or less: it reports `enough=False` with a shortfall and next steps instead of raising. Test in Task 4.
5. Accounts with zero median income: `pension_share` is 0 (not NaN) and the seasonal income factors fall back to the population. Test in Task 2.

---

### Task 1: Scaffold, config, Shock and the official formula

**Files:**
- Create: `requirements.txt`, `resilience/__init__.py`, `resilience/config.py`, `resilience/shocks.py`, `resilience/official.py`, `tests/__init__.py`, `tests/test_official.py`

**Interfaces:**
- Produces:
  - `config.DATA_DIR: Path`, `config.CACHE_DIR: Path` (= repo/`cache`), `config.EI_RATE = 0.55`, `config.EI_MAX_WEEKLY: float`, `config.EI_SOURCE: str`, `config.EI_MONTHLY_CAP = EI_MAX_WEEKLY * 52 / 12`, `config.SIM_YEAR = 2026`, `config.MAX_RUNWAY = 120`, `config.SHRINK_K = 3`.
  - `shocks.Shock` (frozen dataclass): `job_loss: bool = False`, `ei_rate: float = 0.55`, `ei_months: int = 6`, `bills_pct: float = 0.0`, `extra_monthly: float = 0.0`, `one_off: float = 0.0`, `one_off_months_of_spending: float = 0.0`, `start_month: int = 11`; method `one_off_total(S: float) -> float` = `one_off + one_off_months_of_spending * S`.
  - `shocks.TWIST_PRESETS: dict[str, Shock]` with keys `"Laid off (EI 55%, 6 months)"`, `"Furnace dies (1 month of spending)"`, `"Job loss + bills +15%"`.
  - `official.runway(buffer_left: float, gap: float) -> float`
  - `official.OfficialResult` dataclass: `income, spending, buffer_left, gap, runway: float`, `label: str`.
  - `official.official_result(p: Mapping, shock: Shock) -> OfficialResult`; `p` needs keys `I, S, B, H`.
  - `official.format_runway(r: OfficialResult) -> str`: `"no shortfall (120+)"` when `buffer_left > 0 and gap <= 0`, else `f"{runway:.1f} months"`.

- [ ] **Step 1: Write `requirements.txt`** (`pandas`, `numpy`, `pyarrow`, `streamlit`, `pytest`) and run `python -m pip install pytest`. Expected: `python -m pytest --version` prints a version.

- [ ] **Step 2: Write the failing tests** in `tests/test_official.py`:

```python
from resilience.official import runway, official_result, format_runway
from resilience.shocks import Shock, TWIST_PRESETS

P = {"I": 5000.0, "S": 4000.0, "B": 12000.0, "H": 1000.0}

def test_runway_rules():
    assert runway(0, 100) == 0
    assert runway(-5, 100) == 0
    assert runway(1000, 0) == 120
    assert runway(1000, -1) == 120
    assert runway(1000, 300) == 3.3
    assert runway(10**9, 1) == 120

def test_job_loss_preset():
    r = official_result(P, TWIST_PRESETS["Laid off (EI 55%, 6 months)"])
    assert r.income == 2750 and r.gap == 1250 and r.runway == 9.6

def test_furnace_preset_uses_one_month_of_S():
    r = official_result(P, TWIST_PRESETS["Furnace dies (1 month of spending)"])
    assert r.buffer_left == 8000 and r.runway == 120
    assert format_runway(r) == "no shortfall (120+)"

def test_combined_preset():
    r = official_result(P, TWIST_PRESETS["Job loss + bills +15%"])
    assert r.spending == 4150 and r.runway == round(12000 / 1400, 1)

def test_buffer_wiped_out():
    r = official_result(P, Shock(one_off=20000))
    assert r.runway == 0 and format_runway(r) == "0.0 months"
```

- [ ] **Step 3: Run** `python -m pytest tests/test_official.py -v`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `config.py`, `shocks.py`, `official.py` per the Interfaces. Look up the 2026 EI maximum weekly benefit on canada.ca (`https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit/benefit-amount.html`) and set `EI_MAX_WEEKLY` and `EI_SOURCE`. Official income = `shock.ei_rate * I` if `job_loss` else `I`; spending = `S + bills_pct * H + extra_monthly`; buffer_left = `B - one_off_total(S)`.

- [ ] **Step 5: Run** `python -m pytest tests/test_official.py -v`. Expected: 5 passed.

- [ ] **Step 6: Commit** `feat: official runway formula, shocks and config`.

---

### Task 2: Per-account profiles

**Files:**
- Create: `resilience/data.py`, `tests/conftest.py`, `tests/test_data.py`

**Interfaces:**
- Consumes: `config.DATA_DIR`, `config.CACHE_DIR`, `config.SHRINK_K`.
- Produces:
  - `data.load_tables(path: Path = DATA_DIR) -> dict[str, pd.DataFrame]` (keys = CSV stems; `partner_bank`/`to_bank` read as str).
  - `data.build_profiles(tables) -> pd.DataFrame` indexed by `account_id` with columns: `I, F, S, B, H, P, ins, D, D_transfers, D_cash, D_card, pension, pension_share, loan_status, loan_end (str 'YYYY-MM' or None), defaulted (float, NaN if no loan), district_name, months, owner_age, sin_1..sin_12, sout_1..sout_12`. `D_*` are medians of `transfers_out_other`, `cash_withdrawals_genuine`, `card_withdrawals`; `D` = median of their sum; `pension` = median `pension_in`; `pension_share = min(pension / I, 1)`, 0 when `I == 0`.
  - `data.get_profiles(path: Path = DATA_DIR) -> pd.DataFrame`: parquet cache at `CACHE_DIR/profiles.parquet`, rebuilt if any CSV is newer.
  - `data.season(p: Mapping, kind: str) -> np.ndarray` (kind `"in"` or `"out"`, length 12, index 0 = January).
  - `tests/conftest.py`: session fixtures `tables` and `profiles` (real data via `get_profiles`), and `skip` all real-data tests if `DATA_DIR` is missing.

Seasonal factor algorithm (not determined by tests alone):

```
ratio = month_value / account_median_of_that_column        (NaN when the account median is 0)
acct[m] = median of ratio over the account's rows in calendar month m;  n[m] = count of those rows
pop[m]  = median of ratio over all rows in calendar month m
factor[m] = clip((n*acct + 3*pop) / (n + 3), 0.25, 4)       (acct NaN -> pop)
```

Loan end month = `Period(loan_start, 'M') + duration_months`; P = `monthly_payment` if end month > `2025-12`.

- [ ] **Step 1: Write the failing tests** in `tests/test_data.py`:
  - `test_shape`: 4,500 rows; all of `I F S B H P` non-null.
  - `test_cross_check_official_inputs`: for 25 accounts sampled with `random_state=0`, recompute I, F, S, H, B directly from `tables["monthly_summary"]` in the test and assert `np.isclose` with the profiles.
  - `test_running_loans`: `(profiles.P > 0).sum() == 448` and `set(profiles.loc[profiles.P > 0, "loan_status"]) == {"C", "D"}`.
  - `test_seasonality_jan_spike`: the median of `sout_1` across accounts > 1.4 and the median of `sout_2` < 1.0; all `sin_*`/`sout_*` within [0.25, 4].
  - `test_zero_income_accounts` (Review Focus 5): `profiles.pension_share.notna().all()` and `profiles.pension_share.between(0, 1).all()`; for accounts with `I == 0` (if any), `sin_*` equals the population value of that month.
  - `test_cache_roundtrip`: a second `get_profiles()` call returns a frame equal to the first.

- [ ] **Step 2: Run** `python -m pytest tests/test_data.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `data.py` per the Interfaces, vectorised with `groupby` (no per-account Python loops).
- [ ] **Step 4: Run** `python -m pytest tests/test_data.py -v`. Expected: all pass, and the first build takes under 60 s.
- [ ] **Step 5: Commit** `feat: per-account profiles with seasonal factors`.

---

### Task 3: Realistic simulation and runway bridge

**Files:**
- Create: `resilience/realistic.py`, `tests/test_realistic.py`

**Interfaces:**
- Consumes: `Shock`, `official_result`, `data.season`, `config.EI_MONTHLY_CAP`, `config.SIM_YEAR`, `config.MAX_RUNWAY`; profile keys `I, S, B, H, P, pension, loan_end, sin_*, sout_*`.
- Produces:
  - `realistic.Toggles` (frozen dataclass): `seasonality, ei_cap, ei_ends, pension_kept, loan_payoff: bool`, all default True; classmethod `Toggles.off()`.
  - `realistic.SimResult` dataclass: `runway: float`, `months: list[str]` ('YYYY-MM', one per simulated month), `balances: list[float]` (balance at the end of each simulated month, same length as `months`), `start_balance: float`.
  - `realistic.simulate(p: Mapping, shock: Shock, toggles: Toggles = Toggles()) -> SimResult`
  - `realistic.BRIDGE_STEPS = ["Official", "+ Seasonality", "+ EI cap", "+ EI ends", "+ Pension kept", "+ Loan payoff"]`
  - `realistic.runway_bridge(p, shock) -> list[tuple[str, float]]`: first entry is the official runway, then the toggles are switched on cumulatively in that order.

Month k (k = 0, 1, …) is calendar month `(start_month - 1 + k) % 12 + 1`. Income and spending rules exactly as in the spec's `realistic.py` section. Runway algorithm:

```
bal = start = B - one_off_total(S);  if start <= 0: runway = 0
for k in range(120):
    new = bal + income_k - spending_k
    if new < 0: runway = k + bal / (bal - new); stop
    bal = new
else: runway = 120
runway = round(min(runway, 120), 1)
```

The loan payment P is removed from spending for months strictly after `loan_end`.

- [ ] **Step 1: Write the failing tests** in `tests/test_realistic.py`:
  - `test_invariant_toggles_off` (uses the `profiles` fixture): for 200 accounts (`random_state=1`) × all 3 `TWIST_PRESETS`, `simulate(p, s, Toggles.off()).runway == official_result(p, s).runway`.
  - `test_january_hits_harder`: for a synthetic profile with flat income, `sout_1 = 2.0` and other `sout = 1.0`, `I=5000, S=4000, B=12000, H=1000, P=0, pension=0, loan_end=None`, a job loss (`ei_months=60`, `ei_cap=False`) starting in month 1 has a lower runway than one starting in month 7.
  - `test_pension_kept_extends_runway`: the same synthetic profile with `pension=2000`; `Toggles(seasonality=False, ei_cap=False, ei_ends=False, pension_kept=True, loan_payoff=False)` gives a higher runway than `Toggles.off()`.
  - `test_ei_cap_binds`: synthetic `I=20000`; with only `ei_cap=True`, the first month's income equals `EI_MONTHLY_CAP`.
  - `test_no_loan_or_ended_loan` (Review Focus 2): `loan_end=None` and `loan_end="2024-03"` both run, and the "+ Loan payoff" bridge step equals the step before it.
  - `test_extremes_are_finite` (Review Focus 3): for `Shock(job_loss=True, ei_rate=0, ei_months=0, bills_pct=1.0, one_off=10**7)` and `Shock(job_loss=True, ei_rate=0, ei_months=0)`, the runway is in [0, 120] and `len(months) == len(balances)`.
  - `test_bridge_shape`: `[s for s, _ in runway_bridge(p, s)] == BRIDGE_STEPS`.
- [ ] **Step 2: Run** `python -m pytest tests/test_realistic.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `realistic.py`.
- [ ] **Step 4: Run** `python -m pytest tests/test_realistic.py -v`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: realistic month-by-month runway and bridge`.

---

### Task 4: Goal plan and backup plan

**Files:**
- Create: `resilience/plan.py`, `tests/test_plan.py`

**Interfaces:**
- Consumes: `official_result`, `Shock`; profile keys `I, F, S, B, D, D_transfers, D_cash, D_card, P`.
- Produces:
  - `plan.GoalPlan` dataclass: `months_target: int, target, gap, surplus, monthly_saving: float, months_to_goal: float | None, cut_needed: float`.
  - `plan.goal_plan(p, months_target: int = 6) -> GoalPlan`: target = `months_target * F`; gap = `max(target - B, 0)`; surplus = `I - S`; monthly_saving = `0.5 * surplus` if surplus > 0, else `min(0.10 * I, D)` with `cut_needed` set to that amount; months_to_goal = `gap / monthly_saving` (0 if gap == 0; None if monthly_saving == 0).
  - `plan.LEVERS = [("Other transfers out", "D_transfers"), ("Cash withdrawals", "D_cash"), ("Card spending", "D_card")]`
  - `plan.BackupPlan` dataclass: `target_runway, required_cut, total_cut, runway_after, shortfall: float`, `cuts: dict[str, float]`, `enough: bool`, `next_steps: list[str]`.
  - `plan.backup_plan(p, shock, target_runway: float | None = None) -> BackupPlan`: default target = `shock.ei_months + 3` if `job_loss` else 6. `required_cut = max(spending - income - buffer_left / target, 0)` from `official_result`; if `buffer_left <= 0`, required_cut = `inf`. Cuts are filled in `LEVERS` order, each capped at its median. `runway_after` = official runway with `extra_monthly` reduced by `total_cut`. `enough = total_cut >= required_cut`. `shortfall = required_cut - total_cut` if not enough, else 0 (`inf` stays `inf`). `next_steps` always includes "Apply for EI within 4 weeks of the job loss" when `job_loss`, and "Ask the lender to defer the $P/month loan payment" when `not enough and P > 0`.
- [ ] **Step 1: Write the failing tests** in `tests/test_plan.py`:
  - `test_goal_plan_surplus`: synthetic `I=5000, S=4000, F=1500, B=3000, D=2000` → target 9000, gap 6000, saving 500, months 12.0.
  - `test_goal_plan_deficit`: `I=4000, S=4500` → monthly_saving = cut_needed = 400.
  - `test_backup_reaches_target` (uses `profiles`): for accounts where the plan says `enough` under the combined preset, `runway_after >= target_runway` (check 100 accounts).
  - `test_cuts_capped`: every `cuts[name] <= p[col]` for the levers.
  - `test_buffer_gone` (Review Focus 4): `Shock(one_off=10**7, job_loss=True)` → `enough is False`, `shortfall == inf`, and `next_steps` is non-empty.
- [ ] **Step 2: Run** `python -m pytest tests/test_plan.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `plan.py`.
- [ ] **Step 4: Run** `python -m pytest tests/test_plan.py -v`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: goal and backup plans`.

---

### Task 5: Population insights

**Files:**
- Create: `resilience/insights.py`, `tests/test_insights.py`

**Interfaces:**
- Consumes: `official_result`, `simulate`, `TWIST_PRESETS`, `Shock`, profiles, `tables["monthly_summary"]`, `config.EI_MONTHLY_CAP`.
- Produces:
  - `insights.wilson(k: int, n: int) -> tuple[float, float]` (95%).
  - `insights.default_by_runway(profiles) -> DataFrame[band, n, defaults, rate, lo, hi]`, bands `"≤3", "3–6", "6–12", ">12"` (edges (−1,3], (3,6], (6,12], (12,120]) on the official runway under the laid-off preset, using only accounts with a loan.
  - `insights.seasonal_factors(monthly) -> DataFrame[month (1–12), spending, income]`: median of the per-account ratio to the account's own median.
  - `insights.hidden_fragile(profiles) -> dict` with `baseline_ok` (official baseline gap ≤ 0 and B > 0) and `fragile` (of those, combined-preset runway < 6).
  - `insights.shock_month_effect(profiles, months=(1, 7)) -> DataFrame` indexed by account with `official` and `realistic_m{m}` columns, for a job loss (EI 55%, 6 months) starting in each month.
  - `insights.population_flags(profiles) -> dict` with `pension_dominant_share` (`pension_share > 0.5`) and `ei_cap_binding_share` (`0.55 * (I - pension) > EI_MONTHLY_CAP`).
- [ ] **Step 1: Write the failing tests** in `tests/test_insights.py` (regression against the evidence in the spec, with tolerance for rounding):
  - `test_default_lift`: the "≤3" band has n between 140 and 155 and a rate between 0.22 and 0.28; the "6–12" band's rate < 0.08.
  - `test_seasonal`: January spending between 1.7 and 1.85; June income > 1.25.
  - `test_hidden_fragile`: `baseline_ok == 3315` and `fragile` between 820 and 850.
  - `test_flags`: `pension_dominant_share` between 0.15 and 0.18.
  - `test_wilson`: `wilson(0, 10)[0] == 0` and `lo < k/n < hi` for `wilson(37, 147)`.
  - `test_shock_month_effect`: the median of `realistic_m1` < the median of `realistic_m7`.
- [ ] **Step 2: Run** `python -m pytest tests/test_insights.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `insights.py`.
- [ ] **Step 4: Run** `python -m pytest tests/test_insights.py -v`. Expected: all pass. If `test_shock_month_effect` fails, that disproves the January headline: stop and report it to the user rather than loosening the test.
- [ ] **Step 5: Commit** `feat: population insights`.

---

### Task 6: Streamlit app

**Files:**
- Create: `app.py`, `tests/test_app.py`

**Interfaces:**
- Consumes: everything above. Cache `get_profiles()` and `load_tables()` with `st.cache_data`; cache each insights function with `st.cache_data`.

Layout (spec "app.py" section):
- `st.set_page_config(page_title="Resilience Rewired", layout="wide")`; three tabs: `"Engine"`, `"Findings"`, `"Method & limits"`.
- Engine:
  - `st.number_input("Account ID", key="account_id", step=1, value=<first account>)`.
  - If the ID is not in the profiles: `st.warning("Account <id> not found")` and `st.stop()`.
  - Metric row: Typical money in (I), Fixed costs (F), Typical spending (S), Buffer (B), Baseline runway.
  - Shock panel: one `st.button` per `TWIST_PRESETS` key (key `preset_<i>`), which writes its fields into `st.session_state`; then the widgets `job_loss` checkbox, `ei_rate` slider 0–1, `ei_months` 0–12, `bills_pct` 0–1, `extra_monthly`, `one_off`, `one_off_months_of_spending` 0–6, `start_month` select 1–12.
  - Results: two big metrics, "Official runway" (`format_runway`) and "Realistic runway"; a bridge bar chart; a balance-path line chart (`st.altair_chart`) with a zero line; the goal plan and backup plan written as sentences with dollar values.
- Findings: the default-by-runway bar chart with error bars, the seasonal chart, the hidden-fragile numbers, January vs July runway, and the population flags, each with a one-sentence caption.
- Method & limits: definitions, the PKDD'99 origin, the `days_below_zero` leakage note, and source links (CTU dataset, canada.ca EI page from `config.EI_SOURCE`, StatCan tables from the track README).

- [ ] **Step 1: Write the failing tests** in `tests/test_app.py` using `streamlit.testing.v1.AppTest`:
  - `test_app_loads`: `AppTest.from_file("app.py", default_timeout=180).run()`; `not at.exception`; `len(at.tabs) == 3`.
  - `test_preset_runs`: after load, click `at.button(key="preset_2")`, run; `not at.exception`, and at least one metric label contains "Official runway".
  - `test_unknown_account` (Review Focus 1): set `at.number_input(key="account_id").set_value(999999999)`, run; `at.warning[0].value` contains "not found" and `not at.exception`.
- [ ] **Step 2: Run** `python -m pytest tests/test_app.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `app.py`.
- [ ] **Step 4: Run** `python -m pytest tests/test_app.py -v`. Expected: all pass. Then run `streamlit run app.py`, open it in the browser pane, click through all 3 presets on 2 accounts, and check that the charts render.
- [ ] **Step 5: Commit** `feat: Streamlit resilience engine app`.

---

### Task 7: README and final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** with: the question; what the engine does; the 3 headline findings, with numbers taken from running the insights functions (not copied from the spec); how to run (`pip install -r requirements.txt`, set `TANGERINE_DATA`, `streamlit run app.py`, `python -m pytest`); limitations (Czech origin, `days_below_zero` leakage, the static formula vs simulation, small loan sample sizes); and the data credits (PKDD'99 / CTU Prague link, canada.ca EI, StatCan).
- [ ] **Step 2: Run** `python -m pytest -v`. Expected: every test passes; paste the summary line into the final report.
- [ ] **Step 3: Commit** `docs: README with findings and run instructions`.
