"""The judges' published runway formula, reproduced exactly."""
from dataclasses import dataclass
from typing import Mapping

from .config import MAX_RUNWAY
from .shocks import Shock


def runway(buffer_left: float, gap: float) -> float:
    if buffer_left <= 0:
        return 0.0
    if gap <= 0:
        return float(MAX_RUNWAY)
    return round(min(buffer_left / gap, MAX_RUNWAY), 1)


@dataclass
class OfficialResult:
    income: float
    spending: float
    buffer_left: float
    gap: float
    runway: float
    label: str


def format_runway(r: OfficialResult) -> str:
    if r.buffer_left > 0 and r.gap <= 0:
        return "no shortfall (120+)"
    return f"{r.runway:.1f} months"


def official_result(p: Mapping, shock: Shock) -> OfficialResult:
    I, S, B, H = float(p["I"]), float(p["S"]), float(p["B"]), float(p["H"])
    income = shock.ei_rate * I if shock.job_loss else I
    spending = S + shock.bills_pct * H + shock.extra_monthly
    buffer_left = B - shock.one_off_total(S)
    gap = spending - income
    r = OfficialResult(income, spending, buffer_left, gap, runway(buffer_left, gap), "")
    r.label = format_runway(r)
    return r
