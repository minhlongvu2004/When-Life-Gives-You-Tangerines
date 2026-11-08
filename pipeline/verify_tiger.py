"""The release gate: prove the numbers in Tiger Data equal the numbers the app ships with.

Usage:  python pipeline/verify_tiger.py

1. Every row of customer_metrics must equal app/public/data/metrics.json,
   compared to one decimal.
2. Every golden case in pipeline/golden.json (36,000) is re-run through the
   reference runway formula, using I, S, H and B read from SQL. The result must
   equal the case's expected runway.

Exits with code 1 on any mismatch and prints the first 10 of each kind.
If this fails, fix the SQL, not the test.
"""
import json
import os
import re
import sys

import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from engine_ref import runway  # noqa: E402

METRICS_JSON = os.path.join(ROOT, "app", "public", "data", "metrics.json")
GOLDEN_JSON = os.path.join(HERE, "golden.json")

# metrics.json column -> customer_metrics column (quoted where it is mixed case)
NUMERIC = ["I", "F", "S", "B", "H", "P", "ins", "loanPay", "disc", "card", "cash",
           "xfer", "fees", "pension", "nonPensionI", "incomeCV", "months"]
TEXT = ["region"]
MAX_SHOWN = 10


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    path = os.path.join(ROOT, "app", ".env.local")
    m = re.search(r"^DATABASE_URL=(.+)$", open(path, encoding="utf-8").read(), re.M)
    if not m:
        raise SystemExit("DATABASE_URL is not set (env var or app/.env.local).")
    return m.group(1).strip().strip("\"'")


def same(a, b, digits: int) -> bool:
    """Equal to `digits` decimals. None only equals None.

    Rounding alone gives false alarms: SQL and pandas add the same numbers in a
    different order, so a mean can differ in the 12th digit (17999.85 vs
    17999.850000000002). On a .x5 tie that flips the rounded value. So two
    numbers also count as equal when they differ by less than 1e-6 relative.
    A real difference in the data is far larger than that and still fails.
    """
    if a is None or b is None:
        return a is None and b is None
    a, b = float(a), float(b)
    if abs(a - b) <= 1e-6 * max(1.0, abs(a), abs(b)):
        return True
    return round(a, digits) == round(b, digits)


def main() -> None:
    cols_sql = ", ".join(f'"{c}"' for c in NUMERIC + TEXT)
    with psycopg.connect(database_url(), connect_timeout=20) as conn:
        sql_rows = conn.execute(
            f"SELECT account_id, {cols_sql} FROM customer_metrics"
        ).fetchall()

    sql = {r[0]: dict(zip(NUMERIC + TEXT, r[1:])) for r in sql_rows}

    # ---- 1. customer_metrics vs metrics.json --------------------------------
    metrics = json.load(open(METRICS_JSON))
    cols = metrics["columns"]
    file_rows = {r[0]: dict(zip(cols, r)) for r in metrics["rows"]}

    bad1 = []
    for aid in sorted(set(sql) | set(file_rows)):
        if aid not in sql:
            bad1.append(f"account {aid}: in metrics.json, missing from SQL")
            continue
        if aid not in file_rows:
            bad1.append(f"account {aid}: in SQL, missing from metrics.json")
            continue
        for c in NUMERIC:
            # incomeCV is stored with 2 decimals in the file, everything else with full precision.
            digits = 2 if c == "incomeCV" else 1
            if not same(sql[aid][c], file_rows[aid][c], digits):
                bad1.append(f"account {aid} {c}: sql={sql[aid][c]} file={file_rows[aid][c]}")
        for c in TEXT:
            if sql[aid][c] != file_rows[aid][c]:
                bad1.append(f"account {aid} {c}: sql={sql[aid][c]} file={file_rows[aid][c]}")
    print(f"metrics.json: {len(file_rows)} accounts, {len(sql)} in SQL, {len(bad1)} mismatches")

    # ---- 2. golden runway cases, with numbers read from SQL -----------------
    golden = json.load(open(GOLDEN_JSON))
    bad2 = []
    for aid, mult, bills, extra, one_off_mult, expected in golden:
        m = sql.get(aid)
        if m is None:
            bad2.append(f"account {aid}: missing from SQL")
            continue
        got = runway(
            m["B"],
            one_off_mult * m["S"],
            m["S"] + bills * m["H"] + extra,
            mult * m["I"],
        )
        if not same(got, expected, 1):
            bad2.append(f"account {aid} case {[mult, bills, extra, one_off_mult]}: sql={got} expected={expected}")
    print(f"golden cases: {len(golden)} run, {len(bad2)} mismatches")

    for title, bad in (("metrics.json", bad1), ("golden", bad2)):
        if bad:
            print(f"\nFirst {min(MAX_SHOWN, len(bad))} {title} mismatches:")
            for line in bad[:MAX_SHOWN]:
                print("  ", line)

    if bad1 or bad2:
        print("\nFAILED")
        sys.exit(1)
    print("\nPASS: 0 mismatches.")


if __name__ == "__main__":
    main()
