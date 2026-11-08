"""Precompute the account-history details shown on the Tangerine Pulse page.

Usage:  python pipeline/build_pulse.py [path/to/data]
Reads:  monthly_summary.csv, transactions.csv, standing_orders.csv, accounts.csv
Writes: app/public/data/pulse.json

The resilience SCORE is not computed here: the Pulse page reuses rank.json (pipeline/build_rank.py)
so an account has exactly one score across the app. This file adds historical context only:

  * last 12 monthly rows: money in / out trend (last 6 vs previous 6 months), months that ended a day
    below zero, lowest end-of-day balance, typical fixed costs (bills + insurance + loan payments)
  * transactions.csv, same 12 months: large one-off payments (a single debit of at least a full month of the
    account's typical monthly spending), the largest one, and penalty-interest charges.
    Unlabelled transactions are reported by their operation only, never given a guessed purpose.
  * standing_orders.csv: recurring commitments by labelled purpose (blank purpose = "other")

All money is CAD. Data is historical (2020-2025), not live banking data.
"""
from __future__ import annotations

import glob
import json
import math
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "public", "data", "pulse.json")
LARGE_SHARE = 1.0  # a debit at least this multiple of typical monthly spending counts as a large one-off


def find_data_dir() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    cands = glob.glob(os.path.join(ROOT, "data*", "data")) + [os.path.join(ROOT, "data"), os.path.expanduser("~/Desktop/Datasets")]
    for h in cands:
        if os.path.exists(os.path.join(h, "monthly_summary.csv")):
            return h
    raise SystemExit("Could not find data folder; pass it as an argument.")


def r(x, d=2):
    if x is None:
        return None
    x = float(x)
    return None if math.isnan(x) or math.isinf(x) else round(x, d)


def main():
    D = find_data_dir()
    print("data:", D)
    acc = pd.read_csv(os.path.join(D, "accounts.csv")).drop_duplicates("account_id")
    ms = pd.read_csv(os.path.join(D, "monthly_summary.csv")).drop_duplicates(["account_id", "month"]).sort_values(["account_id", "month"])
    so = pd.read_csv(os.path.join(D, "standing_orders.csv"), dtype={"to_bank": str})
    tx = pd.read_csv(
        os.path.join(D, "transactions.csv"),
        usecols=["account_id", "date", "direction", "operation", "purpose", "amount"],
        dtype={"purpose": str, "operation": str, "direction": str},
    )
    print("transactions:", len(tx))

    g = ms.groupby("account_id")
    S = g.money_out.median()
    F = (ms.household_bills + ms.insurance + ms.loan_payments).groupby(ms.account_id).median()
    last12 = g.tail(12)
    first_month = last12.groupby("account_id").month.min()
    last_month = g.month.max()

    # ---- monthly trend over the last 12 rows
    def halves(df: pd.DataFrame, col: str):
        v = df[col].to_numpy()
        if len(v) < 12:
            return None
        prev, recent = v[:6].mean(), v[6:].mean()
        return None if prev <= 0 else (recent - prev) / prev

    trend_in = last12.groupby("account_id").apply(lambda d: halves(d, "money_in"), include_groups=False)
    trend_out = last12.groupby("account_id").apply(lambda d: halves(d, "money_out"), include_groups=False)
    neg_months = (last12.days_below_zero > 0).groupby(last12.account_id).sum()
    low_bal = last12.groupby("account_id").min_balance.min()

    # ---- transactions in each account's last 12 months
    tx["month"] = tx.date.str[:7]
    tx = tx.merge(first_month.rename("from"), left_on="account_id", right_index=True)
    tx = tx[tx.month >= tx["from"]]
    debits = tx[tx.direction.str.startswith("debit")].copy()
    debits["S"] = debits.account_id.map(S)
    big = debits[(debits.S > 0) & (debits.amount >= LARGE_SHARE * debits.S)]
    big_count = big.groupby("account_id").size()
    big_top = big.sort_values("amount", ascending=False).drop_duplicates("account_id").set_index("account_id")
    penalty = tx[tx.purpose.fillna("").str.startswith("penalty interest")]
    pen_count = penalty.groupby("account_id").size()
    pen_total = penalty.groupby("account_id").amount.sum()
    debit_count = debits.groupby("account_id").size()

    # ---- standing orders (recurring commitments)
    so["purpose"] = so.purpose.fillna("other")
    so_total = so.groupby("account_id").amount.sum()
    so_count = so.groupby("account_id").size()
    so_by = so.groupby(["account_id", "purpose"]).amount.sum()

    cols = [
        "id", "from", "to", "trendIn", "trendOut", "negMonths", "lowBal", "F",
        "bigCount", "bigAmt", "bigMonth", "bigOp", "bigPurpose", "penCount", "penTotal", "debits",
        "soCount", "soTotal", "soBills", "soIns", "soLease", "soLoan", "soOther",
    ]
    rows = []
    for aid in acc.account_id.sort_values():
        if aid not in S.index:
            continue
        top = big_top.loc[aid] if aid in big_top.index else None

        def so_p(p):
            return r(so_by.get((aid, p), 0.0))

        rows.append([
            int(aid), first_month.get(aid), last_month.get(aid), r(trend_in.get(aid), 4), r(trend_out.get(aid), 4),
            int(neg_months.get(aid, 0)), r(low_bal.get(aid)), r(F.get(aid)),
            int(big_count.get(aid, 0)), r(top.amount) if top is not None else None, top.month if top is not None else None,
            top.operation if top is not None else None,
            (top.purpose if isinstance(top.purpose, str) else "") if top is not None else None,
            int(pen_count.get(aid, 0)), r(pen_total.get(aid, 0.0)), int(debit_count.get(aid, 0)),
            int(so_count.get(aid, 0)), r(so_total.get(aid, 0.0)),
            so_p("household bills"), so_p("insurance"), so_p("leasing"), so_p("loan payment"), so_p("other"),
        ])

    meta = {"largeShare": LARGE_SHARE, "window": 12, "note": "Historical data (2020-2025), not live banking data."}
    with open(OUT, "w") as f:
        json.dump({"meta": meta, "cols": cols, "rows": rows}, f, separators=(",", ":"))
    print(f"wrote {len(rows)} accounts, {os.path.getsize(OUT) // 1024} KB")
    print("accounts with a large one-off:", int((big_count > 0).sum()), " with penalty interest:", int((pen_count > 0).sum()))


if __name__ == "__main__":
    main()
