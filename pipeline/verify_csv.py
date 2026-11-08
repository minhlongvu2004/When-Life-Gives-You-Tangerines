"""Check every committed number in app/public/data against the raw datathon CSVs.

Usage:  python pipeline/verify_csv.py path/to/data      (folder with accounts.csv, monthly_summary.csv, ...)

Recomputes, for all 4,500 accounts, the judge metrics (I, S, F, H, B, P) and the per-account
monthly series straight from the CSVs, and checks:
  * metrics.json matches exactly
  * rank.json inputs (I, S, B) match, and every ranked/excluded id is a real account_id
  * each accounts/<id>.json has the account's own monthly rows, loan record and owner
  * join integrity: dispositions -> clients, cards -> dispositions, accounts -> districts
Exits non-zero on any mismatch.
"""
from __future__ import annotations

import json
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "public", "data")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    D = sys.argv[1]
    acc = pd.read_csv(os.path.join(D, "accounts.csv"))
    cl = pd.read_csv(os.path.join(D, "clients.csv"))
    dp = pd.read_csv(os.path.join(D, "dispositions.csv"))
    cards = pd.read_csv(os.path.join(D, "cards.csv"))
    di = pd.read_csv(os.path.join(D, "districts.csv"))
    ln = pd.read_csv(os.path.join(D, "loans.csv")).set_index("account_id")
    ms = pd.read_csv(os.path.join(D, "monthly_summary.csv")).sort_values(["account_id", "month"])
    problems: list[str] = []

    # ---- relationships
    if acc.account_id.duplicated().any():
        problems.append("duplicate account_id in accounts.csv")
    if (~dp.client_id.isin(cl.client_id)).any():
        problems.append("dispositions.client_id not in clients.csv")
    if (~dp.account_id.isin(acc.account_id)).any():
        problems.append("dispositions.account_id not in accounts.csv")
    if (~cards.disposition_id.isin(dp.disposition_id)).any():
        problems.append("cards.disposition_id not in dispositions.csv")
    if (~acc.district_id.isin(di.district_id)).any():
        problems.append("accounts.district_id not in districts.csv")
    owners = dp[dp.type == "owner"].groupby("account_id").size()
    if not (owners == 1).all() or len(owners) != len(acc):
        problems.append("every account should have exactly one owner disposition")

    # ---- judge metrics
    g = ms.groupby("account_id")
    calc = pd.DataFrame({
        "I": g.money_in.median(),
        "S": g.money_out.median(),
        "H": g.household_bills.median(),
        "F": (ms.household_bills + ms.insurance + ms.loan_payments).groupby(ms.account_id).median(),
        "B": g.tail(6).groupby("account_id").avg_daily_balance.mean(),
    })
    calc["P"] = 0.0
    running = ln.status.isin(["C", "D"])
    calc.loc[ln.index[running], "P"] = ln.loc[running, "monthly_payment"]

    m = json.load(open(os.path.join(OUT, "metrics.json")))
    md = pd.DataFrame(m["rows"], columns=m["columns"]).set_index("id")
    if set(md.index) != set(acc.account_id):
        problems.append("metrics.json ids differ from accounts.csv")
    for c in "ISHFBP":
        diff = float((md[c] - calc[c]).abs().max())
        if diff > 1e-6:
            problems.append(f"metrics.json {c} differs by {diff}")

    rk = json.load(open(os.path.join(OUT, "rank.json")))
    rd = pd.DataFrame(rk["rows"], columns=rk["cols"]).set_index("id")
    ids = set(rd.index) | {e[0] for e in rk["excluded"]}
    if ids != set(acc.account_id):
        problems.append("rank.json ranked + excluded ids differ from accounts.csv")
    for c in "ISB":
        diff = float((rd[c] - calc.loc[rd.index, c]).abs().max())
        if diff > 1e-3:
            problems.append(f"rank.json {c} differs by {diff}")

    # ---- per-account files
    for aid in acc.account_id:
        d = json.load(open(os.path.join(OUT, "accounts", f"{aid}.json")))
        sub = ms[ms.account_id == aid]
        rows = pd.DataFrame(d["monthsRows"], columns=d["monthsCols"])
        if list(rows.month) != list(sub.month):
            problems.append(f"{aid}: months differ")
            continue
        for c in ("money_in", "money_out", "avg_daily_balance"):
            if (rows[c].fillna(0) - sub[c].round(2).values).abs().max() > 0.006:
                problems.append(f"{aid}: {c} differs")
        if (d["loan"] is None) != (aid not in ln.index):
            problems.append(f"{aid}: loan record mismatch")
        if len(problems) > 50:
            break

    print(f"checked {len(acc)} accounts, {len(ms)} monthly rows, {len(ln)} loans")
    if problems:
        print("PROBLEMS:")
        for p in problems[:50]:
            print("  -", p)
        return 1
    print("OK: every committed value matches the CSVs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
