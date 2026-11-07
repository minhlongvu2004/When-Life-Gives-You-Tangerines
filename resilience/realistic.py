"""Month-by-month runway simulation that adds what the static formula misses."""
from dataclasses import dataclass, field, replace
from typing import Mapping

import pandas as pd

from .config import EI_MONTHLY_CAP, MAX_RUNWAY, SIM_YEAR
from .data import DATA_END, season
from .official import official_result
from .shocks import Shock


@dataclass(frozen=True)
class Toggles:
    seasonality: bool = True
    ei_cap: bool = True
    ei_ends: bool = True
    pension_kept: bool = True
    loan_payoff: bool = True

    @classmethod
    def off(cls) -> "Toggles":
        return cls(False, False, False, False, False)


@dataclass
class SimResult:
    runway: float
    start_balance: float
    months: list[str] = field(default_factory=list)
    balances: list[float] = field(default_factory=list)
    income: list[float] = field(default_factory=list)
    spending: list[float] = field(default_factory=list)


BRIDGE_STEPS = ["Official", "+ Seasonality", "+ EI cap", "+ EI ends", "+ Pension kept", "+ Loan payoff"]
_BRIDGE_FIELDS = ["seasonality", "ei_cap", "ei_ends", "pension_kept", "loan_payoff"]


def _loan_end(p: Mapping):
    end = p.get("loan_end")
    return None if end is None or pd.isna(end) else pd.Period(end, "M")


def simulate(p: Mapping, shock: Shock, toggles: Toggles = Toggles()) -> SimResult:
    I, S, H, P = float(p["I"]), float(p["S"]), float(p["H"]), float(p.get("P", 0) or 0)
    pension = float(p.get("pension", 0) or 0)
    s_in, s_out = season(p, "in"), season(p, "out")
    loan_end = _loan_end(p) if toggles.loan_payoff and P > 0 else None
    start = pd.Period(f"{SIM_YEAR}-{shock.start_month:02d}", "M")
    if loan_end is not None and loan_end < start:
        # Ended before the shock. If it was still running when the data ended (P > 0 by
        # definition), S still contains the payment, so remove it from month 0. Loans that
        # ended inside the data window have P = 0 and nothing to remove.
        loan_end = start - 1 if loan_end > DATA_END else None

    pension_part = min(pension, I) if toggles.pension_kept else 0.0
    ei = shock.ei_rate * max(I - pension_part, 0.0)
    if toggles.ei_cap:
        ei = min(ei, EI_MONTHLY_CAP)
    extra = shock.bills_pct * H + shock.extra_monthly

    bal = float(p["B"]) - shock.one_off_total(S)
    res = SimResult(runway=0.0, start_balance=bal)
    if bal <= 0:
        return res

    runway = float(MAX_RUNWAY)
    for k in range(MAX_RUNWAY):
        period = start + k
        cal = period.month - 1
        if not shock.job_loss:
            income = I * s_in[cal] if toggles.seasonality else I
        elif toggles.ei_ends and k >= shock.ei_months:
            income = pension_part
        else:
            income = pension_part + ei
        spending = (S * s_out[cal] if toggles.seasonality else S) + extra
        if loan_end is not None and period > loan_end:
            spending -= P
        new = bal + income - spending
        res.months.append(str(period))
        res.balances.append(new)
        res.income.append(income)
        res.spending.append(spending)
        if new < 0:
            runway = k + bal / (bal - new)
            break
        bal = new
    res.runway = round(min(runway, MAX_RUNWAY), 1)
    return res


def runway_bridge(p: Mapping, shock: Shock) -> list[tuple[str, float]]:
    steps = [(BRIDGE_STEPS[0], official_result(p, shock).runway)]
    t = Toggles.off()
    for name, fld in zip(BRIDGE_STEPS[1:], _BRIDGE_FIELDS):
        t = replace(t, **{fld: True})
        steps.append((name, simulate(p, shock, t).runway))
    return steps
