from resilience.insights import (default_by_runway, hidden_fragile, population_flags,
                                 seasonal_factors, shock_month_effect, wilson)


def test_wilson():
    assert wilson(0, 10)[0] == 0
    lo, hi = wilson(37, 147)
    assert lo < 37 / 147 < hi


def test_default_lift(profiles):
    d = default_by_runway(profiles).set_index("band")
    assert list(d.index) == ["≤3", "3–6", "6–12", ">12"]
    assert 140 <= d.loc["≤3", "n"] <= 155
    assert 0.22 <= d.loc["≤3", "rate"] <= 0.28
    assert d.loc["6–12", "rate"] < 0.08
    assert d.n.sum() == 682


def test_seasonal(tables):
    s = seasonal_factors(tables["monthly_summary"]).set_index("month")
    assert 1.7 <= s.loc[1, "spending"] <= 1.85
    assert s.loc[6, "income"] > 1.25


def test_hidden_fragile(profiles):
    h = hidden_fragile(profiles)
    assert h["baseline_ok"] == 3315
    assert 820 <= h["fragile"] <= 850


def test_flags(profiles):
    f = population_flags(profiles)
    assert 0.15 <= f["pension_dominant_share"] <= 0.18
    assert 0 <= f["ei_cap_binding_share"] <= 1


def test_shock_month_effect(profiles):
    e = shock_month_effect(profiles)
    assert list(e.columns) == ["official", "realistic_m1", "realistic_m7"]
    assert len(e) == 4500
    assert e.realistic_m1.median() < e.realistic_m7.median()
