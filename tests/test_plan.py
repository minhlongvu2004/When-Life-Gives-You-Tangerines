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
