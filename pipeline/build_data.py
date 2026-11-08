"""Precompute everything the app needs from the raw Tangerine datathon data.

Usage:  python pipeline/build_data.py [path/to/data]
Writes: app/public/data/metrics.json, app/public/data/findings.json,
        app/public/data/accounts/<id>.json, pipeline/golden.json
"""
from __future__ import annotations

import glob
import json
import math
import os
import random
import sys

import numpy as np
import pandas as pd

from engine_ref import EI_MONTHLY_CAP, realistic_jobloss_income, runway

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "public", "data")
DISCRETIONARY = ["card_withdrawals", "cash_withdrawals_genuine", "transfers_out_other"]


def find_data_dir() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    hits = glob.glob(os.path.join(ROOT, "data*", "data")) + glob.glob(os.path.join(ROOT, "data"))
    for h in hits:
        if os.path.exists(os.path.join(h, "monthly_summary.csv")):
            return h
    raise SystemExit("Could not find data folder; pass it as an argument.")


def clean(x):
    """JSON-safe float: keep full precision so the browser sees identical doubles."""
    if x is None:
        return None
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        x = float(x)
        return None if math.isnan(x) else x
    return x


def r2(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), 2)


def main():
    D = find_data_dir()
    print("data:", D)
    ms = pd.read_csv(os.path.join(D, "monthly_summary.csv"))
    loans = pd.read_csv(os.path.join(D, "loans.csv"))
    acc = pd.read_csv(os.path.join(D, "accounts.csv"))
    dist = pd.read_csv(os.path.join(D, "districts.csv"))
    clients = pd.read_csv(os.path.join(D, "clients.csv"))
    disp = pd.read_csv(os.path.join(D, "dispositions.csv"))
    cards = pd.read_csv(os.path.join(D, "cards.csv"))
    so = pd.read_csv(os.path.join(D, "standing_orders.csv"), dtype={"to_bank": str})

    ms = ms.sort_values(["account_id", "month"]).reset_index(drop=True)
    ms["fixed"] = ms.household_bills + ms.insurance + ms.loan_payments
    ms["discretionary"] = ms[DISCRETIONARY].sum(axis=1)
    ms["non_pension_in"] = ms.money_in - ms.pension_in
    g = ms.groupby("account_id")

    # ---- Judge definitions (exact) ----
    m = pd.DataFrame({
        "I": g.money_in.median(),
        "F": g.fixed.median(),
        "S": g.money_out.median(),
        "B": g.tail(6).groupby("account_id").avg_daily_balance.mean(),
        "H": g.household_bills.median(),
    })
    loans_i = loans.set_index("account_id")
    running = loans_i.status.isin(["C", "D"])
    m["P"] = 0.0
    m.loc[loans_i.index[running], "P"] = loans_i.loc[running, "monthly_payment"].astype(float)

    # ---- Extra descriptors ----
    m["ins"] = g.insurance.median()
    m["loanPay"] = g.loan_payments.median()
    m["disc"] = g.discretionary.median()
    m["card"] = g.card_withdrawals.median()
    m["cash"] = g.cash_withdrawals_genuine.median()
    m["xfer"] = g.transfers_out_other.median()
    m["fees"] = g.bank_fees.median()
    m["pension"] = g.pension_in.median()
    m["nonPensionI"] = g.non_pension_in.median()
    m["months"] = g.size()
    m["first"] = g.month.first()
    m["last"] = g.month.last()
    m["incomeCV"] = g.money_in.std() / g.money_in.mean()
    m["negMonths"] = (ms.days_below_zero > 0).groupby(ms.account_id).sum()
    m["lastBal"] = g.month_end_balance.last()
    m = m.join(acc.set_index("account_id"))
    m = m.join(dist.set_index("district_id")[["district_name", "region", "average_salary", "unemployment_rate_2023"]], on="district_id")
    m["loanStatus"] = loans_i.status.reindex(m.index)

    # owner info
    owners = disp[disp.type == "owner"].merge(clients, on="client_id", how="left")
    owners["age"] = 2025 - pd.to_datetime(owners.birth_date).dt.year
    owners = owners.merge(cards[["disposition_id", "card_type"]], on="disposition_id", how="left")
    owners = owners.drop_duplicates("account_id").set_index("account_id")
    n_users = disp.groupby("account_id").size()

    # ---- metrics.json: compact table used by the engine ----
    cols = ["I", "F", "S", "B", "H", "P", "ins", "loanPay", "disc", "card", "cash", "xfer", "fees", "pension", "nonPensionI"]
    metrics = {
        "columns": ["id"] + cols + ["region", "incomeCV", "months"],
        "rows": [[int(i)] + [clean(r[c]) for c in cols] + [r["region"], r2(r["incomeCV"]), int(r["months"])]
                 for i, r in m.iterrows()],
        "eiMonthlyCap": EI_MONTHLY_CAP,
    }
    os.makedirs(os.path.join(OUT, "accounts"), exist_ok=True)
    with open(os.path.join(OUT, "metrics.json"), "w") as f:
        json.dump(metrics, f, separators=(",", ":"))

    # ---- per-account detail files ----
    so_g = so.groupby("account_id")
    series_cols = ["money_in", "money_out", "household_bills", "insurance", "loan_payments", "discretionary",
                   "bank_fees", "pension_in", "month_end_balance", "avg_daily_balance", "min_balance", "days_below_zero"]
    for aid, grp in g:
        r = m.loc[aid]
        o = owners.loc[aid] if aid in owners.index else None
        loan = None
        if aid in loans_i.index:
            L = loans_i.loc[aid]
            loan = {"start": L.loan_start, "amount": float(L.amount), "months": int(L.duration_months),
                    "payment": float(L.monthly_payment), "status": L.status, "meaning": L.status_meaning}
        orders = []
        if aid in so_g.groups:
            for _, s in so_g.get_group(aid).iterrows():
                orders.append({"amount": float(s.amount), "purpose": s.purpose if isinstance(s.purpose, str) else "other"})
        detail = {
            "id": int(aid),
            "opened": r["account_opened"],
            "frequency": r["frequency"],
            "district": r["district_name"], "region": r["region"],
            "districtSalary": clean(r["average_salary"]), "districtUnemployment": clean(r["unemployment_rate_2023"]),
            "owner": None if o is None else {"gender": o.gender, "age": int(o.age) if not pd.isna(o.age) else None,
                                             "card": o.card_type if isinstance(o.card_type, str) else None},
            "users": int(n_users.get(aid, 1)),
            "loan": loan,
            "standingOrders": orders,
            "negMonths": int(r["negMonths"]),
            "monthsCols": ["month"] + series_cols,
            "monthsRows": [[row.month] + [r2(getattr(row, c)) for c in series_cols] for row in grp.itertuples()],
        }
        with open(os.path.join(OUT, "accounts", f"{aid}.json"), "w") as f:
            json.dump(detail, f, separators=(",", ":"))

    # ---- findings ----
    m["rwJob"] = [runway(b, 0.0, s, 0.55 * i) for b, s, i in zip(m.B, m.S, m.I)]
    m["rwJobReal"] = [runway(b, 0.0, s, realistic_jobloss_income(np_i, p))
                      for b, s, np_i, p in zip(m.B, m.S, m.nonPensionI, m.pension)]
    m["bufMonths"] = np.where(m.S > 0, m.B / m.S.where(m.S > 0, np.nan), np.nan)
    m["isPensioner"] = (g.pension_in.sum() / g.money_in.sum().replace(0, np.nan)) > 0.5
    labels = ["Lowest", "Low", "Middle", "High", "Highest"]
    m["incomeFifth"] = pd.qcut(m.I.rank(method="first"), 5, labels=labels)
    m["incomeTenth"] = pd.qcut(m.I.rank(method="first"), 10, labels=[f"D{i}" for i in range(1, 11)])

    def fails(s):
        return float(np.mean([x is not None and x < 6 for x in s]))

    def grp_stats(key, df=None):
        df = m if df is None else df
        out = []
        for k, sub in df.groupby(key, observed=True):
            out.append({
                "group": str(k), "n": int(len(sub)),
                "medianIncome": r2(sub.I.median()), "medianSpending": r2(sub.S.median()), "medianBuffer": r2(sub.B.median()),
                "bufferMonths": r2(sub.bufMonths.median()),
                "failJudge": r2(fails(sub.rwJob)), "failReal": r2(fails(sub.rwJobReal)),
                "pensionerShare": r2(sub.isPensioner.mean()),
            })
        return out

    # pre-loan signals (no leakage: only months before the loan started)
    ms_l = ms.merge(loans[["account_id", "loan_start", "defaulted", "monthly_payment"]], on="account_id")
    ms_l = ms_l[pd.to_datetime(ms_l.month + "-01") < pd.to_datetime(ms_l.loan_start).dt.to_period("M").dt.to_timestamp()]
    pre = ms_l.groupby("account_id").agg(cv=("money_in", lambda x: x.std() / x.mean() if x.mean() else np.nan),
                                         I=("money_in", "median"), defaulted=("defaulted", "first"),
                                         pay=("monthly_payment", "first")).dropna()
    pre["payRatio"] = pre.pay / pre.I.replace(0, np.nan)

    def quart(col, names):
        q = pd.qcut(pre[col].rank(method="first"), 4, labels=names)
        return [{"group": str(k), "n": int(len(s)), "defaultRate": r2(s.defaulted.mean()),
                 "lo": r2(s[col].min()), "hi": r2(s[col].max())} for k, s in pre.groupby(q, observed=True)]

    def auc(y, s):
        ok = ~np.isnan(s)
        y, s = np.asarray(y)[ok], np.asarray(s)[ok]
        rk = pd.Series(s).rank().values
        n1 = y.sum(); n0 = len(y) - n1
        return float((rk[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))

    non_p = m[~m.isPensioner]
    twists = {}
    for name, fn in {
        "baseline": lambda r: runway(r.B, 0.0, r.S, r.I),
        "jobLoss": lambda r: r.rwJob,
        "furnace": lambda r: runway(r.B, r.S, r.S, r.I),
        "jobLossBills": lambda r: runway(r.B, 0.0, r.S + 0.15 * r.H, 0.55 * r.I),
    }.items():
        vals = [fn(r) for r in m.itertuples()]
        twists[name] = {
            "zero": r2(np.mean([v == 0 for v in vals])),
            "under3": r2(np.mean([v is not None and v < 3 for v in vals])),
            "under6": r2(np.mean([v is not None and v < 6 for v in vals])),
            "noShortfall": r2(np.mean([v is None for v in vals])),
        }

    # featured accounts for the demo
    def pick(df, n=1):
        # the most typical member of the group (median income), not an outlier
        df = df.sort_values("I")
        return [int(df.index[len(df) // 2])] if len(df) else []
    solid = (m.F > 0) & (m.H > 0) & (m.months >= 36)
    hi = m[solid & (m.incomeFifth == "Highest") & m.rwJob.apply(lambda v: v is not None and 1.5 < v < 4)].sort_values("I", ascending=False)
    lo = m[solid & (m.incomeFifth == "Lowest") & m.rwJob.apply(lambda v: v is not None and v >= 24) & ~m.isPensioner]
    pens = m[solid & m.isPensioner & m.rwJob.apply(lambda v: v is not None and v > 24)].sort_values("I")
    tight = m[solid & m.rwJob.apply(lambda v: v is not None and 0 < v < 1.5) & (m.P > 0)]
    featured = [
        {"id": a, "label": "High earner, thin buffer"} for a in pick(hi)
    ] + [{"id": a, "label": "Modest income, deep savings"} for a in pick(lo)] + \
        [{"id": a, "label": "Pensioner"} for a in pick(pens)] + \
        [{"id": a, "label": "Loan + living on the edge"} for a in pick(tight)]

    findings = {
        "nAccounts": int(len(m)), "nTransactions": 1056320, "nLoans": int(len(loans)),
        "eiMonthlyCap": EI_MONTHLY_CAP,
        "byFifth": grp_stats("incomeFifth"),
        "byTenth": grp_stats("incomeTenth"),
        "byFifthWorkers": grp_stats("incomeFifth", m[~m.isPensioner]),
        "byTenthWorkers": grp_stats("incomeTenth", m[~m.isPensioner]),
        "nPensioners": int(m.isPensioner.sum()),
        "nonPensionerFailJudge": r2(fails(non_p.rwJob)), "nonPensionerFailReal": r2(fails(non_p.rwJobReal)),
        "allFailJudge": r2(fails(m.rwJob)), "allFailReal": r2(fails(m.rwJobReal)),
        "twists": twists,
        "preLoan": {
            "n": int(len(pre)), "defaults": int(pre.defaulted.sum()),
            "volatility": quart("cv", ["Steadiest", "Steady", "Bumpy", "Most volatile"]),
            "volatilityAUC": r2(auc(pre.defaulted, pre.cv.values)),
            "paymentRatio": quart("payRatio", ["Lightest", "Light", "Heavy", "Heaviest"]),
            "paymentRatioAUC": r2(auc(pre.defaulted, pre.payRatio.values)),
        },
        "featured": featured,
    }
    with open(os.path.join(OUT, "findings.json"), "w") as f:
        json.dump(findings, f, indent=1)

    # ---- golden cases for the TS engine test ----
    rnd = random.Random(42)
    cases = []
    for r in m.itertuples():
        shocks = [(1.0, 0.0, 0.0, 0.0), (0.55, 0.0, 0.0, 0.0), (1.0, 0.0, 0.0, 1.0), (0.55, 0.15, 0.0, 0.0)]
        for _ in range(4):
            shocks.append((round(rnd.uniform(0, 1), 2), round(rnd.uniform(0, 0.5), 2),
                           float(rnd.choice([0, 0, 250, 500, 1200])), round(rnd.choice([0, 0, 0.5, 1, 2, 3]), 2)))
        for mult, bills, extra, one_off_mult in shocks:
            income = mult * r.I
            spending = r.S + bills * r.H + extra
            one_off = one_off_mult * r.S
            cases.append([int(r.Index), mult, bills, extra, one_off_mult, runway(r.B, one_off, spending, income)])
    with open(os.path.join(ROOT, "pipeline", "golden.json"), "w") as f:
        json.dump(cases, f, separators=(",", ":"))

    print(f"accounts={len(m)} golden cases={len(cases)}")
    print(json.dumps({k: findings[k] for k in ["nonPensionerFailJudge", "nonPensionerFailReal", "allFailJudge", "allFailReal"]}))
    for row in findings["byFifth"]:
        print(row)
    print("featured", featured)
    print("preLoan AUCs", findings["preLoan"]["volatilityAUC"], findings["preLoan"]["paymentRatioAUC"])


if __name__ == "__main__":
    main()
