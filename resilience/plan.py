"""Goal plan (build an emergency fund) and backup plan (survive the shock)."""
import math
from dataclasses import dataclass, field, replace
from typing import Mapping

from .official import official_result
from .shocks import Shock

LEVERS = [
    ("Other transfers out", "D_transfers"),
    ("Cash withdrawals", "D_cash"),
    ("Card spending", "D_card"),
]


@dataclass
class GoalPlan:
    months_target: int
    target: float
    gap: float
    surplus: float
    monthly_saving: float
    months_to_goal: float | None
    cut_needed: float
    basis: str = "fixed costs"


def goal_plan(p: Mapping, months_target: int = 6) -> GoalPlan:
    I, S, F, B, D = (float(p[k]) for k in ("I", "S", "F", "B", "D"))
    basis = "fixed costs" if F > 0 else "spending"
    target = months_target * (F if F > 0 else S)
    gap = max(target - B, 0.0)
    surplus = I - S
    cut_needed = 0.0
    if surplus > 0:
        saving = 0.5 * surplus
    else:
        # close the deficit first, then free up 10% of income to save
        cut_needed = min(-surplus + 0.10 * I, D)
        saving = max(surplus + cut_needed, 0.0)
    if gap == 0:
        months = 0.0
    elif saving > 0:
        months = round(gap / saving, 1)
    else:
        months = None
    return GoalPlan(months_target, target, gap, surplus, saving, months, cut_needed, basis)


@dataclass
class BackupPlan:
    target_runway: float
    required_cut: float
    total_cut: float
    runway_after: float
    shortfall: float
    cuts: dict[str, float] = field(default_factory=dict)
    enough: bool = False
    next_steps: list[str] = field(default_factory=list)


def _runway_with_cut(p: Mapping, shock: Shock, cut: float, realistic: bool) -> float:
    cut_shock = replace(shock, extra_monthly=shock.extra_monthly - cut)
    if realistic:
        from .realistic import simulate  # local import: realistic imports official, not plan
        return simulate(p, cut_shock).runway
    return official_result(p, cut_shock).runway


def _realistic_required_cut(p: Mapping, shock: Shock, target: float) -> float:
    """Smallest monthly cut (to $1) that keeps the realistic runway at or above target."""
    if _runway_with_cut(p, shock, 0.0, True) >= target:
        return 0.0
    hi = max(float(p["S"]), 1.0)
    for _ in range(40):
        if _runway_with_cut(p, shock, hi, True) >= target:
            break
        hi *= 2
    else:
        return math.inf
    lo = 0.0
    while hi - lo > 1.0:
        mid = (lo + hi) / 2
        if _runway_with_cut(p, shock, mid, True) >= target:
            hi = mid
        else:
            lo = mid
    return float(math.ceil(hi))


def backup_plan(p: Mapping, shock: Shock, target_runway: float | None = None,
                realistic: bool = False) -> BackupPlan:
    if target_runway is None:
        target_runway = shock.ei_months + 3 if shock.job_loss else 6
    r = official_result(p, shock)
    if r.buffer_left <= 0:
        required = math.inf
    elif realistic:
        required = _realistic_required_cut(p, shock, target_runway)
    else:
        required = max(r.spending - r.income - r.buffer_left / target_runway, 0.0)

    cuts, remaining = {}, required
    for name, col in LEVERS:
        cut = min(max(float(p[col]), 0.0), remaining)
        cuts[name] = cut
        remaining -= cut
    total = sum(cuts.values())
    enough = total >= required
    shortfall = 0.0 if enough else required - total
    after = _runway_with_cut(p, shock, total, realistic)

    steps = []
    if shock.job_loss:
        steps.append("Apply for EI within 4 weeks of the job loss")
    if not enough and float(p.get("P", 0) or 0) > 0:
        steps.append(f"Ask the lender to defer the ${float(p['P']):,.0f}/month loan payment")
    if not enough:
        gap_text = "the buffer is already used up" if math.isinf(shortfall) else f"${shortfall:,.0f}/month still uncovered"
        steps.append(f"Spending cuts alone are not enough ({gap_text}): look for extra income or lower fixed bills")
    return BackupPlan(target_runway, required, total, after, shortfall, cuts, enough, steps)
