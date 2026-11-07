"""Population-level findings shown on the Findings tab."""
import math

import numpy as np
import pandas as pd

from .config import EI_MONTHLY_CAP
from .official import official_result
from .realistic import simulate
from .shocks import TWIST_PRESETS, Shock

LAID_OFF = TWIST_PRESETS["Laid off (EI 55%, 6 months)"]
COMBINED = TWIST_PRESETS["Job loss + bills +15%"]
BANDS = ["≤3", "3–6", "6–12", ">12"]


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    phat = k / n
    denom = 1 + z**2 / n
    centre = (phat + z**2 / (2 * n)) / denom
    half = z * math.sqrt(phat * (1 - phat) / n + z**2 / (4 * n**2)) / denom
    return (max(centre - half, 0.0), min(centre + half, 1.0))


def _official_runways(profiles: pd.DataFrame, shock: Shock) -> pd.Series:
    return pd.Series({acc: official_result(p, shock).runway for acc, p in profiles.iterrows()})


def default_by_runway(profiles: pd.DataFrame) -> pd.DataFrame:
    loans = profiles[profiles.defaulted.notna()]
    rw = _official_runways(loans, LAID_OFF)
    band = pd.cut(rw, [-1, 3, 6, 12, 120], labels=BANDS)
    rows = []
    for b in BANDS:
        d = loans.defaulted[band == b]
        k, n = int(d.sum()), int(len(d))
        lo, hi = wilson(k, n)
        rows.append({"band": b, "n": n, "defaults": k, "rate": k / n if n else np.nan, "lo": lo, "hi": hi})
    return pd.DataFrame(rows)


def seasonal_factors(monthly: pd.DataFrame) -> pd.DataFrame:
    cal = monthly["month"].str[5:7].astype(int)
    out = {}
    for col, name in (("money_out", "spending"), ("money_in", "income")):
        med = monthly.groupby("account_id")[col].transform("median")
        out[name] = (monthly[col] / med.where(med > 0)).groupby(cal).median()
    df = pd.DataFrame(out)
    df.index.name = "month"
    return df.reset_index()


def hidden_fragile(profiles: pd.DataFrame) -> dict:
    ok = profiles[(profiles.I >= profiles.S) & (profiles.B > 0)]
    fragile = int((_official_runways(ok, COMBINED) < 6).sum())
    return {"baseline_ok": int(len(ok)), "fragile": fragile}


def shock_month_effect(profiles: pd.DataFrame, months=(1, 7)) -> pd.DataFrame:
    out = pd.DataFrame(index=profiles.index)
    out["official"] = _official_runways(profiles, LAID_OFF)
    for m in months:
        s = Shock(job_loss=True, ei_rate=0.55, ei_months=6, start_month=m)
        out[f"realistic_m{m}"] = [simulate(p, s).runway for _, p in profiles.iterrows()]
    return out


def population_flags(profiles: pd.DataFrame) -> dict:
    non_pension = (profiles.I - profiles.pension).clip(lower=0)
    return {
        "pension_dominant_share": float((profiles.pension_share > 0.5).mean()),
        "ei_cap_binding_share": float((0.55 * non_pension > EI_MONTHLY_CAP).mean()),
    }
