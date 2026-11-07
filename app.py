"""Resilience Rewired: Tangerine financial resilience engine (Streamlit UI)."""
import math
from dataclasses import fields

import altair as alt
import pandas as pd
import streamlit as st

from resilience.config import DATA_DIR, EI_MAX_WEEKLY, EI_MONTHLY_CAP, EI_SOURCE, MAX_RUNWAY
from resilience.data import get_profiles
from resilience.insights import (default_by_runway, example_accounts, hidden_fragile,
                                 population_flags, seasonal_factors, shock_month_effect)
from resilience.official import format_runway, official_result
from resilience.plan import backup_plan, goal_plan
from resilience.realistic import runway_bridge, simulate
from resilience.shocks import TWIST_PRESETS, Shock

st.set_page_config(page_title="Resilience Rewired", layout="wide")
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
SHOCK_KEYS = {"job_loss": "job_loss", "ei_rate": "ei_rate", "ei_months": "ei_months",
              "bills_pct": "bills_pct", "extra_monthly": "extra_monthly", "one_off": "one_off",
              "one_off_months_of_spending": "one_off_months"}


@st.cache_data(show_spinner="Building customer profiles…")
def load_profiles() -> pd.DataFrame:
    return get_profiles()


@st.cache_data(show_spinner=False)
def load_monthly() -> pd.DataFrame:
    return pd.read_csv(DATA_DIR / "monthly_summary.csv")


@st.cache_data(show_spinner="Computing population findings…")
def findings() -> dict:
    p = load_profiles()
    effect = shock_month_effect(p)
    return {
        "default": default_by_runway(p),
        "seasonal": seasonal_factors(load_monthly()),
        "fragile": hidden_fragile(p),
        "effect": effect,
        "flags": population_flags(p),
        "examples": example_accounts(p, effect),
    }


def money(x: float) -> str:
    return f"${x:,.0f}"


def md(text: str) -> str:
    """Escape $ so Streamlit markdown does not render it as LaTeX."""
    return text.replace("$", r"\$")


def init_state(first_account: int) -> None:
    defaults = {"account_id": first_account, "start_month": 11, "months_target": 6}
    for f in fields(Shock):
        if f.name in SHOCK_KEYS:
            defaults[SHOCK_KEYS[f.name]] = f.default
    for k, v in defaults.items():
        st.session_state.setdefault(k, v)


def apply_preset(shock: Shock) -> None:
    for attr, key in SHOCK_KEYS.items():
        st.session_state[key] = getattr(shock, attr)


def current_shock() -> Shock:
    s = st.session_state
    return Shock(job_loss=s.job_loss, ei_rate=float(s.ei_rate), ei_months=int(s.ei_months),
                 bills_pct=float(s.bills_pct), extra_monthly=float(s.extra_monthly),
                 one_off=float(s.one_off), one_off_months_of_spending=float(s.one_off_months),
                 start_month=int(s.start_month))


profiles = load_profiles()
init_state(int(profiles.index[0]))
F = findings()

st.title("Resilience Rewired")
st.caption("How long can a Tangerine customer last when life hits? The judges' formula vs. what the "
           "customer's own month-by-month history says.")

engine, findings_tab, method = st.tabs(["Engine", "Findings", "Method & limits"])

# ---------------------------------------------------------------- Engine
with engine:
    top = st.columns([1, 3])
    top[0].number_input("Account ID", key="account_id", step=1, format="%d")
    top[1].caption("Try " + ", ".join(str(a) for a in F["examples"]) +
                   ": typical customers whose realistic runway after a January job loss is far "
                   "below the official number.")
    acc = int(st.session_state.account_id)
    if acc not in profiles.index:
        st.warning(f"Account {acc} not found. Account IDs run from {profiles.index.min()} "
                   f"to {profiles.index.max()} (with gaps).")
        st.stop()
    p = profiles.loc[acc]

    st.subheader("1 · Know the customer")
    base = official_result(p, Shock())
    c = st.columns(5)
    c[0].metric("Typical money in (I)", money(p.I))
    c[1].metric("Fixed costs (F)", money(p.F), help="Household bills + insurance + loan payments (median)")
    c[2].metric("Typical spending (S)", money(p.S))
    c[3].metric("Savings buffer (B)", money(p.B), help="Mean average daily balance, last 6 months")
    c[4].metric("Runway today", format_runway(base))
    loan = "no loan" if pd.isna(p.loan_status) else f"loan status {p.loan_status}, ends {p.loan_end}"
    st.caption(md(f"District: {p.district_name} · owner age {p.owner_age:.0f} · "
                  f"{p.pension_share:.0%} of income from pension · {loan} · "
                  f"loan payment P = {money(p.P)}/month · {int(p.months)} months of history"))
    hist = load_monthly().query("account_id == @acc").tail(24)
    hist_long = hist.melt("month", ["money_in", "money_out"], var_name="flow", value_name="amount")
    st.altair_chart(alt.Chart(hist_long).mark_line(point=True).encode(
        x=alt.X("month:N", title=None), y=alt.Y("amount:Q", title="CAD"),
        color=alt.Color("flow:N", title=None)).properties(height=200), use_container_width=True)

    st.subheader("2 · Take a shock")
    pc = st.columns(len(TWIST_PRESETS))
    for i, (name, shock) in enumerate(TWIST_PRESETS.items()):
        pc[i].button(name, key=f"preset_{i}", on_click=apply_preset, args=(shock,), use_container_width=True)
    sc = st.columns(4)
    sc[0].checkbox("Job loss", key="job_loss")
    sc[0].slider("EI pays (share of income)", 0.0, 1.0, step=0.05, key="ei_rate")
    sc[1].slider("EI lasts (months)", 0, 12, key="ei_months")
    sc[1].slider("Household bills up by", 0.0, 1.0, step=0.05, key="bills_pct", format="%.2f")
    sc[2].number_input("Extra monthly cost ($)", step=100.0, key="extra_monthly")
    sc[2].number_input("One-off cost ($)", step=500.0, key="one_off")
    sc[3].slider("One-off cost (months of spending)", 0.0, 6.0, step=0.5, key="one_off_months")
    sc[3].selectbox("Shock starts in", list(range(1, 13)), key="start_month",
                    format_func=lambda m: f"{MONTH_NAMES[m - 1]} 2026")
    shock = current_shock()

    off = official_result(p, shock)
    sim = simulate(p, shock)
    rc = st.columns(2)
    rc[0].metric("Official runway", format_runway(off),
                 help="Judges' formula: (B − one-off) ÷ (spending after shock − income after shock)")
    real_label = "no shortfall (120+)" if sim.runway >= MAX_RUNWAY else f"{sim.runway:.1f} months"
    rc[1].metric("Realistic runway", real_label,
                 delta=None if off.runway == sim.runway else f"{sim.runway - off.runway:+.1f} months vs official",
                 help="Month-by-month: this customer's seasonal spending, EI cap and duration, pension kept, loan payoff")

    bc = st.columns(2)
    bridge = pd.DataFrame(runway_bridge(p, shock), columns=["step", "runway"])
    bc[0].markdown("**Why the two numbers differ**")
    bc[0].altair_chart(alt.Chart(bridge).mark_bar().encode(
        x=alt.X("step:N", sort=list(bridge.step), title=None),
        y=alt.Y("runway:Q", title="Runway (months)"),
        tooltip=["step", "runway"]).properties(height=260), use_container_width=True)

    n = max(len(sim.balances), 1)
    path = pd.DataFrame({"month": sim.months, "Realistic": sim.balances})
    if n:
        path["Official"] = [off.buffer_left - off.gap * (k + 1) for k in range(len(sim.months))]
    path_long = path.melt("month", var_name="engine", value_name="balance")
    bc[1].markdown("**Buffer after the shock**")
    line = alt.Chart(path_long).mark_line(point=True).encode(
        x=alt.X("month:N", title=None), y=alt.Y("balance:Q", title="Balance (CAD)"),
        color=alt.Color("engine:N", title=None))
    zero = alt.Chart(pd.DataFrame({"y": [0]})).mark_rule(color="red").encode(y="y:Q")
    bc[1].altair_chart((line + zero).properties(height=260), use_container_width=True)

    st.subheader("3 · Make a plan")
    pl = st.columns(2)
    with pl[0]:
        st.markdown("**Goal: emergency fund (no shock)**")
        basis = "fixed costs" if p.F > 0 else "spending (no labelled bills)"
        st.radio("Target", [3, 6], key="months_target", horizontal=True,
                 format_func=lambda k: f"{k} months of {basis}")
        g = goal_plan(p, int(st.session_state.months_target))
        if g.gap == 0:
            st.success(md(f"Already there: buffer {money(p.B)} covers the {money(g.target)} target."))
        else:
            how = (f"Save {money(g.monthly_saving)}/month (half of the {money(g.surplus)} monthly surplus)"
                   if g.cut_needed == 0 else
                   f"Spending is above income, so first cut {money(g.cut_needed)}/month of discretionary "
                   f"spending and save it")
            when = "" if g.months_to_goal is None else f" to reach it in about {g.months_to_goal:.0f} months"
            st.write(md(f"Target {money(g.target)}; gap {money(g.gap)}. {how}{when}."))
    with pl[1]:
        st.markdown("**Backup: if the shock hits**")
        b = backup_plan(p, shock, realistic=True)
        b_off = backup_plan(p, shock)
        if b.required_cut == 0:
            st.success(f"No cuts needed: the realistic runway already reaches {b.target_runway:.0f} months.")
        else:
            lines = [f"- {name}: cut {money(v)}/month" for name, v in b.cuts.items() if v > 0]
            req = "everything (buffer is gone)" if math.isinf(b.required_cut) else f"{money(b.required_cut)}/month"
            st.write(md(f"To last {b.target_runway:.0f} months, spending must drop by {req}.\n" + "\n".join(lines)))
            st.write(f"Realistic runway after these cuts: **{b.runway_after:.1f} months**.")
            off_req = "no cut" if b_off.required_cut == 0 else (
                "everything" if math.isinf(b_off.required_cut) else money(b_off.required_cut) + "/month")
            st.caption(md(f"The judges' formula would ask for {off_req}; the realistic engine accounts for "
                          "seasonal spikes, the EI cap and EI ending."))
        for s in b.next_steps:
            st.write(md(f"- {s}"))

# ---------------------------------------------------------------- Findings
with findings_tab:
    eff = F["effect"]
    k = st.columns(3)
    k[0].metric("Median runway after job loss, official", f"{eff.official.median():.1f} months")
    k[1].metric("Same customers, January job loss, realistic", f"{eff.realistic_m1.median():.1f} months")
    k[2].metric("Customers under 3 months (official → realistic Jan)",
                f"{(eff.official < 3).sum():,} → {(eff.realistic_m1 < 3).sum():,}")
    st.caption("Job loss with EI at 55% for 6 months, all 4,500 accounts.")

    f1, f2 = st.columns(2)
    d = F["default"]
    f1.markdown("**Short runway predicts loan default**")
    bars = alt.Chart(d).mark_bar().encode(x=alt.X("band:N", sort=list(d.band), title="Runway after job loss (months)"),
                                          y=alt.Y("rate:Q", title="Default rate", axis=alt.Axis(format="%")),
                                          tooltip=["band", "n", "defaults", alt.Tooltip("rate:Q", format=".1%")])
    errs = alt.Chart(d).mark_errorbar().encode(x=alt.X("band:N", sort=list(d.band)), y="lo:Q", y2="hi:Q")
    f1.altair_chart((bars + errs).properties(height=260), use_container_width=True)
    f1.caption(f"{d.rate.iloc[0]:.0%} of loans default when runway is 3 months or less, vs "
               f"{d.rate.iloc[2]:.0%} at 6–12 months (n = {', '.join(map(str, d.n))}; 95% intervals).")

    s = F["seasonal"].melt("month", var_name="flow", value_name="factor")
    s["month"] = s.month.map(lambda m: MONTH_NAMES[m - 1])
    f2.markdown("**Money moves in seasons**")
    f2.altair_chart(alt.Chart(s).mark_line(point=True).encode(
        x=alt.X("month:N", sort=MONTH_NAMES, title=None), y=alt.Y("factor:Q", title="× the customer's typical month"),
        color=alt.Color("flow:N", title=None)).properties(height=260), use_container_width=True)
    f2.caption("Income bumps in June and December; cash spending spikes in January and June. "
               "A shock in January lands right after the bonus is spent.")

    fr, fl = F["fragile"], F["flags"]
    g1 = st.columns(3)
    g1[0].metric("Look safe today but fall under 6 months (job loss + bills +15%)",
                 f"{fr['fragile']:,} of {fr['baseline_ok']:,}")
    g1[1].metric("Customers where the EI cap bites", f"{fl['ei_cap_binding_share']:.0%}",
                 help=md(f"55% of non-pension income exceeds ${EI_MAX_WEEKLY:.0f}/week (≈{money(EI_MONTHLY_CAP)}/month)"))
    g1[2].metric("Mostly pension income (a 'job loss' twist doesn't fit)", f"{fl['pension_dominant_share']:.0%}")

    counts = pd.DataFrame({
        "engine": ["Official", "Realistic, Jan start", "Realistic, Jul start"],
        "under 3 months": [(eff[c] < 3).sum() for c in eff.columns],
        "under 6 months": [(eff[c] < 6).sum() for c in eff.columns],
    })
    st.dataframe(counts, hide_index=True, use_container_width=True)

# ---------------------------------------------------------------- Method
with method:
    st.markdown(md(f"""
**Official runway** reproduces the track README exactly: I = median money in, S = median money out,
H = median household bills, F = median (bills + insurance + loan payments), B = mean average daily balance
over the last 6 months, P = loan payment if the loan runs past December 2025.
Runway = (B − one-off) ÷ (spending after shock − income after shock), 0 if the buffer is gone,
"no shortfall (120+)" if there is no gap, capped at 120, rounded to 1 decimal.

**Realistic runway** steps month by month from the chosen start month in 2026 and adds, one at a time
(the bars in the bridge chart):
1. *Seasonality*: each customer's own calendar-month spending and income pattern, shrunk toward the
   population average when history is thin.
2. *EI cap*: EI pays 55% but at most ${EI_MAX_WEEKLY:.0f}/week in 2026 ([canada.ca]({EI_SOURCE})).
3. *EI ends*: after the EI months, job income is gone.
4. *Pension kept*: pension income is not lost in a layoff.
5. *Loan payoff*: the loan payment stops after the loan's last month.
With all five switched off, the realistic engine returns exactly the official number (tested on 200 accounts × 3 twists).

**Plans.** Goal: a 3- or 6-month fixed-cost emergency fund, funded with half the monthly surplus.
Backup: the monthly cut needed to last EI months + 3 (or 6 months), taken from other transfers, then cash,
then card spending, each capped at the customer's own typical amount.

**Limits we know about**
- The data is the PKDD'99 Czech bank dataset (district names are Czech), relabelled as CAD and shifted to 2020–2025.
- About half of transactions have no purpose label, so "discretionary" spending is an approximation.
- `days_below_zero > 0` matches loan default 100% of the time; it is probably a result of default, so we do not use it as a predictor.
- Seasonality assumes past January/June cash spikes continue after a job loss; a careful customer could cut them, which is exactly what the backup plan suggests.
- Only 682 loans: the default-rate bands have wide intervals (shown).

**Sources:** [PKDD'99 Financial dataset, CTU Prague](https://relational.fel.cvut.cz/dataset/Financial) ·
[EI 2026 maximum]({EI_SOURCE}) · [EI regular benefits](https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html)
"""))
