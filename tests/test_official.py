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
