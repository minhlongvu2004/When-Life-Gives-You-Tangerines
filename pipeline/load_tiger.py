"""Load the raw CSVs into Tiger Data (Postgres + TimescaleDB).

Usage:  python pipeline/load_tiger.py [path/to/data/folder]

Safe to rerun: every table is dropped and recreated each time.
DATABASE_URL is read from the environment, or from app/.env.local.
"""
import csv
import glob
import os
import re
import sys

import psycopg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Column types are chosen to match how pandas reads the CSVs in build_data.py:
# money values are double precision so SQL medians equal pandas medians.
TABLES = {
    "districts": """
        district_id int, district_name text, region text, inhabitants int,
        municipalities_under_500 int, municipalities_500_1999 int,
        municipalities_2000_9999 int, municipalities_over_10000 int,
        num_cities int, urban_ratio_pct double precision, average_salary double precision,
        unemployment_rate_2022 double precision, unemployment_rate_2023 double precision,
        entrepreneurs_per_1000 int, crimes_2022 int, crimes_2023 int""",
    "accounts": "account_id int, district_id int, frequency text, account_opened date",
    "clients": "client_id int, gender text, birth_date date, district_id int",
    "dispositions": "disposition_id int, client_id int, account_id int, type text",
    "cards": "card_id int, disposition_id int, card_type text, issued date",
    "loans": """
        loan_id int, account_id int, loan_start date, amount double precision,
        duration_months int, monthly_payment double precision, status text,
        status_meaning text, defaulted int""",
    "standing_orders": """
        order_id int, account_id int, to_bank text, to_account text,
        amount double precision, purpose text""",
    # month arrives as text ('2022-11'); it is converted to a date below.
    "monthly_summary": """
        account_id int, month text,
        money_in double precision, money_out double precision,
        cash_deposits double precision, transfers_in double precision,
        pension_in double precision, interest_in double precision,
        household_bills double precision, insurance double precision,
        loan_payments double precision, bank_fees double precision,
        cash_withdrawals_genuine double precision, card_withdrawals double precision,
        transfers_out_other double precision, month_end_balance double precision,
        min_balance double precision, avg_daily_balance double precision,
        days_below_zero double precision""",
}


def find_data_dir() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    hits = glob.glob(os.path.join(ROOT, "data*", "data")) + glob.glob(os.path.join(ROOT, "data"))
    for h in hits:
        if os.path.exists(os.path.join(h, "monthly_summary.csv")):
            return h
    raise SystemExit("Could not find data folder; pass it as an argument.")


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    path = os.path.join(ROOT, "app", ".env.local")
    if os.path.exists(path):
        m = re.search(r"^DATABASE_URL=(.+)$", open(path, encoding="utf-8").read(), re.M)
        if m:
            return m.group(1).strip().strip("\"'")
    raise SystemExit("DATABASE_URL is not set (env var or app/.env.local).")


def csv_rows(path: str) -> int:
    with open(path, newline="", encoding="utf-8") as f:
        return sum(1 for _ in csv.reader(f)) - 1  # minus header


def main() -> None:
    data = find_data_dir()
    print("data:", data)
    results = []
    with psycopg.connect(database_url(), connect_timeout=20) as conn:
        for name, cols in TABLES.items():
            csv_path = os.path.join(data, f"{name}.csv")
            conn.execute(f"DROP TABLE IF EXISTS {name} CASCADE")
            conn.execute(f"CREATE TABLE {name} ({cols})")
            with open(csv_path, "rb") as f, conn.cursor().copy(
                f"COPY {name} FROM STDIN WITH (FORMAT csv, HEADER true)"
            ) as cp:
                while chunk := f.read(1 << 20):
                    cp.write(chunk)
            db_rows = conn.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
            results.append((name, csv_rows(csv_path), db_rows))

        # monthly_summary: text month -> date, then a hypertable on month.
        conn.execute(
            "ALTER TABLE monthly_summary ALTER COLUMN month TYPE date "
            "USING (month || '-01')::date"
        )
        conn.execute(
            "SELECT create_hypertable('monthly_summary', by_range('month', INTERVAL '3 months'), "
            "migrate_data => true)"
        )
        conn.commit()

        hyper = conn.execute(
            "SELECT count(*) FROM timescaledb_information.hypertables "
            "WHERE hypertable_name = 'monthly_summary'"
        ).fetchone()[0]
        chunks = conn.execute(
            "SELECT count(*) FROM timescaledb_information.chunks "
            "WHERE hypertable_name = 'monthly_summary'"
        ).fetchone()[0]

    print(f"{'table':<18}{'csv rows':>10}{'db rows':>10}")
    ok = True
    for name, c, d in results:
        flag = "" if c == d else "   <-- MISMATCH"
        ok = ok and c == d
        print(f"{name:<18}{c:>10}{d:>10}{flag}")
    print(f"monthly_summary is a hypertable: {bool(hyper)} ({chunks} chunks)")
    if not ok or not hyper:
        raise SystemExit("FAILED: row counts differ or hypertable missing.")
    print("OK: every table matches its CSV.")


if __name__ == "__main__":
    main()
