import math
from dataclasses import replace

import pytest

from resilience.config import EI_MONTHLY_CAP
from resilience.official import official_result
from resilience.realistic import BRIDGE_STEPS, Toggles, runway_bridge, simulate
from resilience.shocks import TWIST_PRESETS, Shock


def synthetic(**over):
    p = {"I": 5000.0, "S": 4000.0, "B": 12000.0, "H": 1000.0, "P": 0.0,
         "pension": 0.0, "loan_end": None}
    p.update({f"sin_{m}": 1.0 for m in range(1, 13)})
    p.update({f"sout_{m}": 1.0 for m in range(1, 13)})
    p.update(over)
    return p


def test_invariant_toggles_off(profiles):
    for _, p in profiles.sample(200, random_state=1).iterrows():
        for s in TWIST_PRESETS.values():
            assert simulate(p, s, Toggles.off()).runway == official_result(p, s).runway, (p.name, s)


def test_january_hits_harder():
    p = synthetic(sout_1=2.0)
    jan = simulate(p, Shock(job_loss=True, ei_months=60, start_month=1), Toggles(ei_cap=False))
    jul = simulate(p, Shock(job_loss=True, ei_months=60, start_month=7), Toggles(ei_cap=False))
    assert jan.runway < jul.runway


def test_pension_kept_extends_runway():
    p = synthetic(pension=2000.0)
    only_pension = Toggles(seasonality=False, ei_cap=False, ei_ends=False, pension_kept=True, loan_payoff=False)
    s = Shock(job_loss=True)
    assert simulate(p, s, only_pension).runway > simulate(p, s, Toggles.off()).runway


def test_ei_cap_binds():
    p = synthetic(I=20000.0, S=19000.0, B=50000.0)
    only_cap = Toggles(seasonality=False, ei_cap=True, ei_ends=False, pension_kept=False, loan_payoff=False)
    r = simulate(p, Shock(job_loss=True), only_cap)
    assert math.isclose(r.income[0], EI_MONTHLY_CAP)


@pytest.mark.parametrize("loan_end", [None, "2024-03"])
def test_no_loan_or_ended_loan(loan_end):
    p = synthetic(P=300.0 if loan_end else 0.0, loan_end=loan_end)
    bridge = dict(runway_bridge(p, Shock(job_loss=True)))
    assert bridge["+ Loan payoff"] == bridge["+ Pension kept"]


def test_loan_payoff_helps():
    p = synthetic(P=500.0, loan_end="2027-01", B=30000.0)
    s = Shock(job_loss=True, start_month=1)
    bridge = dict(runway_bridge(p, s))
    assert bridge["+ Loan payoff"] >= bridge["+ Pension kept"]
    r = simulate(p, s, Toggles(seasonality=False, ei_cap=False, ei_ends=False, pension_kept=False))
    assert r.spending[12] == r.spending[13] + 500.0  # 2027-01 still paid, 2027-02 not


@pytest.mark.parametrize("shock", [
    Shock(job_loss=True, ei_rate=0, ei_months=0, bills_pct=1.0, one_off=10**7),
    Shock(job_loss=True, ei_rate=0, ei_months=0),
    Shock(bills_pct=1.0, extra_monthly=50000),
])
def test_extremes_are_finite(shock):
    r = simulate(synthetic(), shock)
    assert 0 <= r.runway <= 120 and len(r.months) == len(r.balances)


def test_bridge_shape():
    assert [s for s, _ in runway_bridge(synthetic(), Shock(job_loss=True))] == BRIDGE_STEPS


def test_months_labels():
    r = simulate(synthetic(), Shock(start_month=11, extra_monthly=3000))
    assert r.months[:3] == ["2026-11", "2026-12", "2027-01"]


def test_loan_ending_in_2026_before_start_is_removed_from_month_0():
    p = synthetic(P=300.0, loan_end="2026-03", B=30000.0)
    t = Toggles(seasonality=False, ei_cap=False, ei_ends=False, pension_kept=False, loan_payoff=True)
    r = simulate(p, Shock(job_loss=True, start_month=11), t)
    assert r.spending[0] == p["S"] - 300.0
