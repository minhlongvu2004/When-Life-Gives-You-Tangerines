import numpy as np
import pandas as pd

from resilience.data import get_profiles, season

SEASON_COLS = [f"sin_{m}" for m in range(1, 13)] + [f"sout_{m}" for m in range(1, 13)]


def test_shape(profiles):
    assert len(profiles) == 4500
    assert profiles[["I", "F", "S", "B", "H", "P"]].notna().all().all()


def test_cross_check_official_inputs(tables, profiles):
    m = tables["monthly_summary"].sort_values(["account_id", "month"])
    sample = profiles.sample(25, random_state=0).index
    for acc in sample:
        rows = m[m.account_id == acc]
        p = profiles.loc[acc]
        assert np.isclose(p.I, rows.money_in.median())
        assert np.isclose(p.S, rows.money_out.median())
        assert np.isclose(p.H, rows.household_bills.median())
        assert np.isclose(p.F, (rows.household_bills + rows.insurance + rows.loan_payments).median())
        assert np.isclose(p.B, rows.tail(6).avg_daily_balance.mean())


def test_running_loans(profiles):
    assert (profiles.P > 0).sum() == 448
    assert set(profiles.loc[profiles.P > 0, "loan_status"]) == {"C", "D"}


def test_seasonality_jan_spike(profiles):
    assert profiles.sout_1.median() > 1.4
    assert profiles.sout_2.median() < 1.0
    assert profiles[SEASON_COLS].apply(lambda c: c.between(0.25, 4)).all().all()


def test_season_helper(profiles):
    p = profiles.iloc[0]
    out = season(p, "out")
    assert out.shape == (12,) and out[0] == p.sout_1


def test_zero_income_accounts(profiles):
    assert profiles.pension_share.notna().all()
    assert profiles.pension_share.between(0, 1).all()
    zero = profiles[profiles.I == 0]
    if len(zero):
        pop = profiles[[f"sin_{m}" for m in range(1, 13)]]
        # every zero-income account carries the same (population) factors
        assert (zero[pop.columns].nunique() == 1).all()


def test_cache_roundtrip(profiles):
    pd.testing.assert_frame_equal(get_profiles(), profiles)
