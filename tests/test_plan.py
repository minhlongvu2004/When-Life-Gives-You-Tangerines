import math
from dataclasses import replace

from resilience.official import official_result
from resilience.plan import LEVERS, backup_plan, goal_plan
from resilience.shocks import TWIST_PRESETS, Shock

BASE = {"I": 5000.0, "S": 4000.0, "F": 1500.0, "B": 3000.0, "H": 1000.0, "P": 0.0,
        "D": 2000.0, "D_transfers": 500.0, "D_cash": 1000.0, "D_card": 500.0}


def test_goal_plan_surplus():
    g = goal_plan(BASE)
    assert (g.target, g.gap, g.monthly_saving, g.months_to_goal) == (9000, 6000, 500, 12.0)
    assert g.cut_needed == 0


def test_goal_plan_deficit():
    g = goal_plan({**BASE, "I": 4000.0, "S": 4500.0})
    assert g.monthly_saving == g.cut_needed == 400


def test_goal_already_met():
    g = goal_plan({**BASE, "B": 20000.0}, months_target=3)
    assert g.gap == 0 and g.months_to_goal == 0


def test_backup_reaches_target(profiles):
    shock = TWIST_PRESETS["Job loss + bills +15%"]
    checked = 0
    for _, p in profiles.sample(100, random_state=2).iterrows():
        b = backup_plan(p, shock)
        if b.enough:
            checked += 1
            assert b.runway_after >= b.target_runway, p.name
            rerun = official_result(p, replace(shock, extra_monthly=shock.extra_monthly - b.total_cut))
            assert rerun.runway == b.runway_after
    assert checked > 0


def test_cuts_capped(profiles):
    shock = TWIST_PRESETS["Job loss + bills +15%"]
    for _, p in profiles.sample(100, random_state=3).iterrows():
        b = backup_plan(p, shock)
        for name, col in LEVERS:
            assert b.cuts[name] <= p[col] + 1e-9


def test_no_cut_needed_when_safe():
    b = backup_plan({**BASE, "B": 1e6}, Shock(job_loss=True))
    assert b.required_cut == 0 and b.enough and sum(b.cuts.values()) == 0


def test_buffer_gone():
    b = backup_plan(BASE, Shock(one_off=10**7, job_loss=True))
    assert b.enough is False and math.isinf(b.shortfall) and b.next_steps
    assert any("EI" in s for s in b.next_steps)


def test_default_target_runway():
    assert backup_plan(BASE, Shock(job_loss=True, ei_months=6)).target_runway == 9
    assert backup_plan(BASE, Shock(bills_pct=0.2)).target_runway == 6


def test_goal_uses_spending_when_no_fixed_costs():
    g = goal_plan({**BASE, "F": 0.0}, months_target=3)
    assert g.target == 3 * BASE["S"] and g.basis == "spending"
    assert goal_plan(BASE).basis == "fixed costs"


def test_backup_realistic_reaches_realistic_target():
    from resilience.realistic import simulate
    p = {**BASE, "B": 8000.0, "pension": 0.0, "loan_end": None,
         **{f"sin_{m}": 1.0 for m in range(1, 13)},
         **{f"sout_{m}": (2.0 if m == 1 else 1.0) for m in range(1, 13)}}
    s = Shock(job_loss=True, start_month=12)
    b = backup_plan(p, s, realistic=True)
    assert b.enough
    after = simulate(p, replace(s, extra_monthly=-b.total_cut)).runway
    assert after >= b.target_runway and b.runway_after == after
    assert b.required_cut > backup_plan(p, s).required_cut  # stricter than the official formula


def test_backup_realistic_not_enough():
    p = {**BASE, "B": 100.0, "D_transfers": 0.0, "D_cash": 10.0, "D_card": 0.0, "pension": 0.0,
         "loan_end": None, **{f"sin_{m}": 1.0 for m in range(1, 13)}, **{f"sout_{m}": 1.0 for m in range(1, 13)}}
    b = backup_plan(p, Shock(job_loss=True), realistic=True)
    assert b.enough is False and b.shortfall > 0 and b.next_steps
