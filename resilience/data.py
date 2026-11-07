"""Load the Tangerine CSVs and build one profile row per account."""
from pathlib import Path
from typing import Mapping

import numpy as np
import pandas as pd

from .config import CACHE_DIR, DATA_DIR, SHRINK_K

DATA_END = pd.Period("2025-12", "M")
AGE_REF = pd.Timestamp("2025-12-31")
MONTHS = range(1, 13)


def load_tables(path: Path = DATA_DIR) -> dict[str, pd.DataFrame]:
    text_cols = {"partner_bank": str, "to_bank": str}
    return {
        p.stem: pd.read_csv(p, dtype=text_cols, low_memory=False)
        for p in sorted(Path(path).glob("*.csv"))
    }


def _seasonal_factors(m: pd.DataFrame, col: str, prefix: str) -> pd.DataFrame:
    """Per-account calendar-month factors, shrunk toward the population."""
    med = m.groupby("account_id")[col].transform("median")
    ratio = m[col] / med.where(med > 0)
    cal = m["month"].str[5:7].astype(int)
    acct = ratio.groupby([m["account_id"], cal]).agg(["median", "count"]).unstack()
    pop = ratio.groupby(cal).median().reindex(MONTHS)
    a = acct["median"].reindex(columns=MONTHS)
    n = acct["count"].reindex(columns=MONTHS).fillna(0)
    pop_frame = pd.DataFrame(np.broadcast_to(pop.values, a.shape), index=a.index, columns=MONTHS)
    blended = (n * a.fillna(0) + SHRINK_K * pop_frame) / (n + SHRINK_K)
    blended = blended.where(a.notna(), pop_frame).clip(0.25, 4)
    blended.columns = [f"{prefix}_{c}" for c in MONTHS]
    return blended


def build_profiles(tables: Mapping[str, pd.DataFrame]) -> pd.DataFrame:
    m = tables["monthly_summary"].sort_values(["account_id", "month"]).reset_index(drop=True)
    m["fixed"] = m.household_bills + m.insurance + m.loan_payments
    m["disc"] = m.transfers_out_other + m.cash_withdrawals_genuine + m.card_withdrawals
    g = m.groupby("account_id")
    prof = g.agg(
        I=("money_in", "median"),
        F=("fixed", "median"),
        S=("money_out", "median"),
        H=("household_bills", "median"),
        ins=("insurance", "median"),
        D=("disc", "median"),
        D_transfers=("transfers_out_other", "median"),
        D_cash=("cash_withdrawals_genuine", "median"),
        D_card=("card_withdrawals", "median"),
        pension=("pension_in", "median"),
        months=("month", "size"),
    )
    prof["B"] = g.tail(6).groupby("account_id").avg_daily_balance.mean()
    prof["pension_share"] = np.where(prof.I > 0, np.minimum(prof.pension / prof.I.where(prof.I > 0), 1), 0.0)

    loans = tables["loans"].copy()
    end = pd.PeriodIndex(pd.to_datetime(loans.loan_start), freq="M") + loans.duration_months.values
    loans["loan_end"] = end.astype(str)
    loans["P"] = np.where(end > DATA_END, loans.monthly_payment, 0.0)
    loans = loans.set_index("account_id")
    prof["P"] = loans.P.reindex(prof.index).fillna(0.0)
    prof["loan_status"] = loans.status.reindex(prof.index)
    prof["loan_end"] = loans.loan_end.reindex(prof.index)
    prof["defaulted"] = loans.defaulted.reindex(prof.index).astype(float)

    acc = tables["accounts"].merge(tables["districts"][["district_id", "district_name"]], on="district_id", how="left")
    prof["district_name"] = acc.set_index("account_id").district_name.reindex(prof.index)

    owners = tables["dispositions"].query("type == 'owner'").merge(tables["clients"], on="client_id")
    owners = owners.drop_duplicates("account_id").set_index("account_id")
    birth = pd.to_datetime(owners.birth_date).reindex(prof.index)
    prof["owner_age"] = ((AGE_REF - birth).dt.days / 365.25).round(1)

    prof = prof.join(_seasonal_factors(m, "money_in", "sin")).join(_seasonal_factors(m, "money_out", "sout"))
    prof.index.name = "account_id"
    return prof


def get_profiles(path: Path = DATA_DIR) -> pd.DataFrame:
    """Profiles from the parquet cache, rebuilt when a source CSV is newer."""
    cache = CACHE_DIR / "profiles.parquet"
    sources = list(Path(path).glob("*.csv"))
    stale = not cache.exists() or any(s.stat().st_mtime > cache.stat().st_mtime for s in sources)
    if stale:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        build_profiles(load_tables(path)).to_parquet(cache)
    return pd.read_parquet(cache)


def season(p: Mapping, kind: str) -> np.ndarray:
    prefix = {"in": "sin", "out": "sout"}[kind]
    return np.array([float(p[f"{prefix}_{m}"]) for m in MONTHS])
