"""Precompute the Resilience Rank for every account.

Usage:  python pipeline/build_rank.py [path/to/data]
Reads:  monthly_summary.csv, loans.csv, standing_orders.csv, accounts.csv
Writes: app/public/data/rank.json

A custom, explainable resilience index for this datathon. It is NOT an official Tangerine score
or a credit score. Every threshold below is written into rank.json so the browser (simulator,
explanations) uses exactly the same rules.

Score = 0.40 x Savings Buffer + 0.25 x Cash Flow + 0.20 x Income Stability + 0.15 x Debt Burden
Each category is 0-100, from piecewise-linear curves (values outside the curve are clamped, which
also keeps outliers from dominating).

Eligibility (otherwise the account gets "unavailable", never a misleading rank):
  * median money_in > 0 and median money_out > 0      (regular activity to measure)
  * last monthly row in 2025-07 or later               (recent data for the savings buffer)
  * at least 11 complete months in the income window   (every account has >= 12 rows)

Ranking: scores are rounded to 1 decimal (what users see). Rank = 1 + number of accounts with a
higher rounded score, so equal scores share a rank ("1224" competition ranking). League comes from
the rank: top 5% Diamond, next 15% Platinum, next 30% Gold, next 30% Silver, last 20% Bronze,
using (rank - 1) / N < cumulative share.
"""
from __future__ import annotations

import glob
import json
import math
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "public", "data", "rank.json")
AS_OF = "2025-12"
RECENT_FROM = "2025-07"
WINDOW = 24  # months of income history used for stability

WEIGHTS = {"buffer": 0.40, "cashflow": 0.25, "stability": 0.20, "debt": 0.15}
CURVES = {
    # months of typical spending covered by the buffer
    "buffer": [[0, 0], [1, 25], [3, 55], [6, 80], [12, 100]],
    # (money in - money out) / max(money in, money out): a share of the account's own scale, not raw income
    "cashflow": [[-0.25, 0], [0, 50], [0.25, 100]],
    # coefficient of variation of monthly money in
    "cv": [[0, 100], [0.25, 85], [0.5, 60], [1.0, 25], [1.5, 0]],
    # share of months with money in below half the usual amount
    "low": [[0, 100], [0.5, 0]],
    # monthly debt obligations / typical money in
    "debt": [[0, 95], [0.1, 82], [0.2, 65], [0.35, 35], [0.5, 10], [0.7, 0]],
}
STABILITY_MIX = {"cv": 0.7, "low": 0.3}
NEUTRAL = 50  # short histories are pulled toward this, in proportion to missing months
DEBT_RULES = {"noRecord": 90, "repaid": 100, "pastDefault": 70, "inArrearsPenalty": 20}
LEAGUES = [
    {"key": "diamond", "name": "Diamond", "top": 0.05},
    {"key": "platinum", "name": "Platinum", "top": 0.20},
    {"key": "gold", "name": "Gold", "top": 0.50},
    {"key": "silver", "name": "Silver", "top": 0.80},
    {"key": "bronze", "name": "Bronze", "top": 1.00},
]


def curve(pts, x):
    if x <= pts[0][0]:
        return float(pts[0][1])
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return float(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
    return float(pts[-1][1])


def find_data_dir() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    cands = glob.glob(os.path.join(ROOT, "data*", "data")) + [os.path.join(ROOT, "data"), os.path.expanduser("~/Desktop/Datasets")]
    for h in cands:
        if os.path.exists(os.path.join(h, "monthly_summary.csv")):
            return h
    raise SystemExit("Could not find data folder; pass it as an argument.")


def r(x, d=4):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), d)


def score_account(a: dict) -> dict:
    """Category scores from raw measurements. Mirrored in app/src/lib/rank.ts (scoreFromInputs)."""
    coverage = a["B"] / a["S"] if a["B"] > 0 else 0.0
    buffer = curve(CURVES["buffer"], coverage)
    ratio = (a["I"] - a["S"]) / max(a["I"], a["S"])
    cashflow = curve(CURVES["cashflow"], ratio)
    raw_stab = STABILITY_MIX["cv"] * curve(CURVES["cv"], a["cv"]) + STABILITY_MIX["low"] * curve(CURVES["low"], a["low"])
    h = min(1.0, a["nWin"] / WINDOW)
    stability = h * raw_stab + (1 - h) * NEUTRAL
    if a["obl"] > 0:
        debt = curve(CURVES["debt"], a["obl"] / a["I"])
        if a["status"] == "D":
            debt = max(0.0, debt - DEBT_RULES["inArrearsPenalty"])
    elif a["status"] == "A":
        debt = DEBT_RULES["repaid"]
    elif a["status"] == "B":
        debt = DEBT_RULES["pastDefault"]
    else:
        debt = DEBT_RULES["noRecord"]
    total = WEIGHTS["buffer"] * buffer + WEIGHTS["cashflow"] * cashflow + WEIGHTS["stability"] * stability + WEIGHTS["debt"] * debt
    return {"buffer": buffer, "cashflow": cashflow, "stability": stability, "debt": debt, "score": total}


def main():
    D = find_data_dir()
    print("data:", D)
    ms = pd.read_csv(os.path.join(D, "monthly_summary.csv"))
    loans = pd.read_csv(os.path.join(D, "loans.csv"))
    so = pd.read_csv(os.path.join(D, "standing_orders.csv"), dtype={"to_bank": str})
    acc = pd.read_csv(os.path.join(D, "accounts.csv"))

    # duplicate references: keep one row per account / account-month
    acc = acc.drop_duplicates("account_id")
    ms = ms.drop_duplicates(["account_id", "month"]).sort_values(["account_id", "month"]).reset_index(drop=True)
    loans = loans.sort_values("loan_start").drop_duplicates("account_id", keep="last").set_index("account_id")
    lease = so[so.purpose == "leasing"].groupby("account_id").amount.sum()

    g = ms.groupby("account_id")
    I = g.money_in.median()
    S = g.money_out.median()
    B = g.tail(6).groupby("account_id").avg_daily_balance.mean()
    last = g.month.max()
    # income window: drop each account's first (partial) month, keep the last WINDOW complete months
    w = ms[g.cumcount() > 0].groupby("account_id").tail(WINDOW)
    gw = w.groupby("account_id")
    mean_in = gw.money_in.mean()
    cv = (gw.money_in.std(ddof=0) / mean_in).where(mean_in > 0)
    med_in = gw.money_in.transform("median")
    low = (w.money_in < 0.5 * med_in).groupby(w.account_id).mean()
    n_win = gw.size()
    lp_med = gw.loan_payments.median()

    rows, excluded = [], []
    for aid in acc.account_id.sort_values():
        if aid not in I.index:
            excluded.append([int(aid), "No monthly summary"])
            continue
        if I[aid] <= 0:
            excluded.append([int(aid), "No regular money coming in"])
            continue
        if S[aid] <= 0:
            excluded.append([int(aid), "No regular spending to measure"])
            continue
        if last[aid] < RECENT_FROM:
            excluded.append([int(aid), "No recent activity (before mid-2025)"])
            continue
        if n_win.get(aid, 0) < 11 or pd.isna(cv.get(aid)):
            excluded.append([int(aid), "Too little income history"])
            continue
        status = loans.status[aid] if aid in loans.index else ""
        running = status in ("C", "D")
        P = float(loans.monthly_payment[aid]) if running else 0.0
        loan_end = ""
        if running:
            st = pd.Timestamp(loans.loan_start[aid])
            end = st + pd.DateOffset(months=int(loans.duration_months[aid]))
            loan_end = f"{end.year}-{end.month:02d}"
        ls = float(lease.get(aid, 0.0))
        obl = max(P, float(lp_med.get(aid, 0.0))) + ls
        a = {
            "id": int(aid),
            "I": float(I[aid]),
            "S": float(S[aid]),
            "B": float(B[aid]),
            "cv": float(cv[aid]),
            "low": float(low[aid]),
            "nWin": int(n_win[aid]),
            "obl": obl,
            "P": P,
            "lease": ls,
            "status": status,
            "loanEnd": loan_end,
        }
        # round inputs first so the browser recomputes from exactly these numbers
        for k in ("I", "S", "B", "cv", "low", "obl", "P", "lease"):
            a[k] = r(a[k])
        a.update(score_account(a))
        a["score1"] = round(a["score"] + 1e-9, 1)
        rows.append(a)

    df = pd.DataFrame(rows)
    N = len(df)
    s1 = df.score1.to_numpy()
    df["rank"] = [int((s1 > x).sum()) + 1 for x in s1]
    df = df.sort_values(["rank", "id"]).reset_index(drop=True)

    def league_of(rank):
        f = (rank - 1) / N
        return next(L["key"] for L in LEAGUES if f < L["top"])

    df["league"] = df["rank"].map(league_of)

    # ---- validation: ranks and leagues agree with the sorted scores
    assert (np.diff(df.score1.to_numpy()) <= 0).all(), "scores not sorted"
    for x, rk in zip(df.score1, df["rank"]):
        assert rk == 1 + int((df.score1 > x).sum())
    order = [L["key"] for L in LEAGUES]
    assert all(order.index(a) <= order.index(b) for a, b in zip(df.league, df.league[1:])), "league order"

    thresholds = {}
    for L in LEAGUES:
        sub = df[df.league == L["key"]]
        thresholds[L["key"]] = {"minScore": float(sub.score1.min()), "maxRank": int(sub["rank"].max()), "count": int(len(sub))}

    cols = ["id", "rank", "score", "buffer", "cashflow", "stability", "debt", "I", "S", "B", "cv", "low", "nWin", "obl", "P", "lease", "status", "loanEnd"]
    out_rows = []
    for _, a in df.iterrows():
        out_rows.append([
            int(a.id), int(a["rank"]), float(a.score1), r(a.buffer, 2), r(a.cashflow, 2), r(a.stability, 2), r(a.debt, 2),
            a.I, a.S, a.B, a.cv, a.low, int(a.nWin), a.obl, a.P, a.lease, a.status, a.loanEnd,
        ])

    reasons = {}
    for _, why in excluded:
        reasons[why] = reasons.get(why, 0) + 1
    meta = {
        "asOf": AS_OF,
        "n": N,
        "total": int(len(acc)),
        "excludedByReason": reasons,
        "weights": WEIGHTS,
        "curves": CURVES,
        "stabilityMix": STABILITY_MIX,
        "window": WINDOW,
        "neutral": NEUTRAL,
        "debtRules": DEBT_RULES,
        "leagues": LEAGUES,
        "thresholds": thresholds,
        "median": float(np.median(df.score1)),
        "top10": float(df.score1[df["rank"] <= math.ceil(0.10 * N)].min()),
        "tieRule": "Scores are rounded to 1 decimal; equal scores share the same rank (1, 2, 2, 4).",
    }
    with open(OUT, "w") as f:
        json.dump({"meta": meta, "cols": cols, "rows": out_rows, "excluded": excluded}, f, separators=(",", ":"))
    print(f"ranked {N} of {len(acc)} accounts; excluded {len(excluded)}: {reasons}")
    print("thresholds:", thresholds)
    print("median", meta["median"], "top10", meta["top10"], "size KB", os.path.getsize(OUT) // 1024)
    print(df[["buffer", "cashflow", "stability", "debt", "score"]].describe().round(1).to_string())


if __name__ == "__main__":
    main()
