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


def goal_plan(p: Mapping, months_target: int = 6) -> GoalPlan:
    I, S, F, B, D = (float(p[k]) for k in ("I", "S", "F", "B", "D"))
    target = months_target * F
    gap = max(target - B, 0.0)
    surplus = I - S
    cut_needed = 0.0
    if surplus > 0:
        saving = 0.5 * surplus
    else:
        saving = cut_needed = min(0.10 * I, D)
    if gap == 0:
        months = 0.0
    elif saving > 0:
        months = round(gap / saving, 1)
    else:
        months = None
    return GoalPlan(months_target, target, gap, surplus, saving, months, cut_needed)


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


def backup_plan(p: Mapping, shock: Shock, target_runway: float | None = None) -> BackupPlan:
    if target_runway is None:
        target_runway = shock.ei_months + 3 if shock.job_loss else 6
    r = official_result(p, shock)
    if r.buffer_left <= 0:
        required = math.inf
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
    after = official_result(p, replace(shock, extra_monthly=shock.extra_monthly - total)).runway

    steps = []
    if shock.job_loss:
        steps.append("Apply for EI within 4 weeks of the job loss")
    if not enough and float(p.get("P", 0) or 0) > 0:
        steps.append(f"Ask the lender to defer the ${float(p['P']):,.0f}/month loan payment")
    if not enough:
        gap_text = "the buffer is already used up" if math.isinf(shortfall) else f"${shortfall:,.0f}/month still uncovered"
        steps.append(f"Spending cuts alone are not enough ({gap_text}): look for extra income or lower fixed bills")
    return BackupPlan(target_runway, required, total, after, shortfall, cuts, enough, steps)
