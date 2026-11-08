-- =====================================================================
-- metrics.sql: the customer numbers, calculated inside Tiger Data.
--
-- Run by pipeline/load_tiger.py right after the raw tables are loaded.
-- Statements are separated by a semicolon at the end of a line, and the
-- runner executes them one at a time (continuous aggregates cannot be
-- created inside a transaction). Do not put a semicolon at the end of a
-- comment line.
--
-- Everything here must reproduce pipeline/build_data.py exactly:
--   medians  -> percentile_cont(0.5), which equals pandas median()
--   std      -> stddev_samp, which equals pandas std() (ddof = 1)
-- The judges' definitions of I, F, S, B, H and P are fixed. The rules
-- engine reads these numbers and never recalculates them.
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS income_group_monthly CASCADE;
DROP TABLE            IF EXISTS account_income_group CASCADE;
DROP VIEW             IF EXISTS account_series CASCADE;
DROP MATERIALIZED VIEW IF EXISTS customer_metrics CASCADE;


-- ---------------------------------------------------------------------
-- 1. customer_metrics: one row per account.
--
-- Judge definitions (exact):
--   I = median monthly money in
--   S = median monthly money out
--   H = median monthly household bills
--   F = median of (household bills + insurance + loan payments)
--   B = mean avg_daily_balance over the account's LAST 6 months
--   P = loan monthly payment if the loan is running (status C or D), else 0
--
-- Extra descriptors used by the app (same names as metrics.json):
--   ins, loanPay, disc, card, cash, xfer, fees, pension, nonPensionI,
--   incomeCV, months, plus region and a few helpers for the findings.
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW customer_metrics AS
WITH monthly AS (
    -- Derived columns, calculated once per account-month.
    SELECT
        account_id,
        month,
        money_in,
        money_out,
        household_bills,
        insurance,
        loan_payments,
        bank_fees,
        pension_in,
        card_withdrawals,
        cash_withdrawals_genuine,
        transfers_out_other,
        avg_daily_balance,
        month_end_balance,
        days_below_zero,
        -- fixed = the bills you cannot skip
        household_bills + insurance + loan_payments                              AS fixed,
        -- discretionary = what the customer chooses to spend
        card_withdrawals + cash_withdrawals_genuine + transfers_out_other        AS discretionary,
        -- income that is not a pension
        money_in - pension_in                                                    AS non_pension_in,
        -- 1 = most recent month. Used to pick the last 6 months for B.
        ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY month DESC)          AS recency
    FROM monthly_summary
),
agg AS (
    SELECT
        account_id,
        -- ---- judge definitions ----
        percentile_cont(0.5) WITHIN GROUP (ORDER BY money_in)                    AS "I",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY fixed)                       AS "F",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY money_out)                   AS "S",
        avg(avg_daily_balance) FILTER (WHERE recency <= 6)                       AS "B",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY household_bills)             AS "H",
        -- ---- extra descriptors ----
        percentile_cont(0.5) WITHIN GROUP (ORDER BY insurance)                   AS ins,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY loan_payments)               AS "loanPay",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY discretionary)               AS disc,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY card_withdrawals)            AS card,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY cash_withdrawals_genuine)    AS cash,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY transfers_out_other)         AS xfer,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY bank_fees)                   AS fees,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY pension_in)                  AS pension,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY non_pension_in)              AS "nonPensionI",
        count(*)                                                                 AS months,
        -- income volatility: sample std / mean. NULL when there is one month
        -- or the mean is 0 (pandas gives NaN in the same cases).
        stddev_samp(money_in) / NULLIF(avg(money_in), 0)                         AS "incomeCV",
        -- months the account was below zero at least one day
        count(*) FILTER (WHERE days_below_zero > 0)                              AS "negMonths",
        -- helpers for the findings
        sum(pension_in)  / NULLIF(sum(money_in), 0)                              AS pension_share,
        min(month)                                                               AS first_month,
        max(month)                                                               AS last_month,
        (array_agg(month_end_balance ORDER BY month DESC))[1]                    AS "lastBal"
    FROM monthly
    GROUP BY account_id
)
SELECT
    a.account_id,
    agg."I", agg."F", agg."S", agg."B", agg."H",
    -- P: only a running loan (C = running OK, D = running in debt) counts.
    CASE WHEN l.status IN ('C', 'D') THEN l.monthly_payment ELSE 0 END           AS "P",
    agg.ins, agg."loanPay", agg.disc, agg.card, agg.cash, agg.xfer, agg.fees,
    agg.pension, agg."nonPensionI",
    d.region,
    agg."incomeCV",
    agg.months,
    agg."negMonths",
    agg."lastBal",
    agg.first_month,
    agg.last_month,
    -- a pensioner gets more than half of their income from a pension
    (agg.pension_share > 0.5)                                                    AS is_pensioner,
    l.status                                                                     AS loan_status,
    a.district_id,
    d.district_name,
    d.average_salary,
    d.unemployment_rate_2023
FROM agg
JOIN accounts a       ON a.account_id = agg.account_id
LEFT JOIN districts d ON d.district_id = a.district_id
LEFT JOIN loans l     ON l.account_id = a.account_id;

-- Lookups by account are the main access pattern.
CREATE UNIQUE INDEX customer_metrics_pk ON customer_metrics (account_id);


-- ---------------------------------------------------------------------
-- 2. account_series: the per-customer chart data (one row per month).
--
-- This replaces app/public/data/accounts/<id>.json "monthsRows".
-- time_bucket('1 month', ...) snaps each row to the first day of its month.
-- ---------------------------------------------------------------------
CREATE VIEW account_series AS
SELECT
    account_id,
    time_bucket('1 month', month)::date                                          AS month,
    money_in,
    money_out,
    household_bills,
    insurance,
    loan_payments,
    card_withdrawals + cash_withdrawals_genuine + transfers_out_other            AS discretionary,
    bank_fees,
    pension_in,
    month_end_balance,
    avg_daily_balance,
    min_balance,
    days_below_zero
FROM monthly_summary;


-- ---------------------------------------------------------------------
-- 3. income groups: fifths of earners, ranked by I.
--
-- Matches build_data.py: pd.qcut(I.rank(method="first"), 5). Ties are
-- broken by account_id, like the "first" ranking over the sorted index.
-- 4,500 accounts split into exactly 900 per fifth.
-- A normal table is used because a continuous aggregate can join a
-- hypertable to a plain table but not to a materialized view.
-- ---------------------------------------------------------------------
CREATE TABLE account_income_group AS
SELECT
    account_id,
    CASE ntile(5) OVER (ORDER BY "I", account_id)
        WHEN 1 THEN 'Lowest'
        WHEN 2 THEN 'Low'
        WHEN 3 THEN 'Middle'
        WHEN 4 THEN 'High'
        WHEN 5 THEN 'Highest'
    END                                                                          AS income_fifth,
    ntile(5) OVER (ORDER BY "I", account_id)                                     AS fifth_no
FROM customer_metrics;

ALTER TABLE account_income_group ADD PRIMARY KEY (account_id);


-- ---------------------------------------------------------------------
-- 4. income_group_monthly: continuous aggregate of monthly averages by
--    income group. It feeds findings like "top earners: 1.8 months".
--
-- Only AVERAGES live here. Exact medians cannot be calculated in a
-- continuous aggregate, and the judges' definitions require medians, so
-- customer_metrics (above) stays a plain materialized view.
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW income_group_monthly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 month', ms.month)                                             AS bucket,
    g.income_fifth,
    g.fifth_no,
    count(*)                                                                     AS n_accounts,
    avg(ms.money_in)                                                             AS avg_money_in,
    avg(ms.money_out)                                                            AS avg_money_out,
    avg(ms.avg_daily_balance)                                                    AS avg_balance,
    avg(ms.days_below_zero)                                                      AS avg_days_below_zero
FROM monthly_summary ms
JOIN account_income_group g ON g.account_id = ms.account_id
GROUP BY bucket, g.income_fifth, g.fifth_no
WITH NO DATA;

CALL refresh_continuous_aggregate('income_group_monthly', NULL, NULL);
