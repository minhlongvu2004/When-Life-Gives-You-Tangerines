import "server-only";
import { Pool } from "pg";

/**
 * Tiger Data (Postgres) access. Server-only: importing this from a client
 * component is a build error, so DATABASE_URL can never reach the browser.
 *
 * Every function returns the exact JSON shape of the static file it replaces:
 *   getMetrics()      <- /data/metrics.json
 *   getFindings()     <- /data/findings.json
 *   getCustomer(id)   <- /data/accounts/<id>.json
 */

const globalForPool = globalThis as unknown as { __pool?: Pool };

function pool(): Pool {
  if (!globalForPool.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // libpq's sslmode=require means "encrypt, don't verify the certificate chain".
    // node-pg treats it as full verification instead, and Tiger Cloud's CA isn't in
    // Node's trust store. So drop the param and ask for the libpq behaviour explicitly.
    globalForPool.__pool = new Pool({
      connectionString: url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""),
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForPool.__pool;
}

// 2026 EI: 55% of insurable earnings up to $729/week -> 729 * 52 / 12 per month.
const EI_MONTHLY_CAP = (729 * 52) / 12;

const METRIC_COLUMNS = [
  "I", "F", "S", "B", "H", "P", "ins", "loanPay", "disc", "card", "cash",
  "xfer", "fees", "pension", "nonPensionI",
] as const;

const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

export async function getMetrics() {
  const cols = METRIC_COLUMNS.map((c) => `"${c}"`).join(", ");
  const { rows } = await pool().query(
    `SELECT account_id, ${cols}, region, "incomeCV", months::int AS months
       FROM customer_metrics ORDER BY account_id`,
  );
  return {
    columns: ["id", ...METRIC_COLUMNS, "region", "incomeCV", "months"],
    rows: rows.map((r) => [
      r.account_id,
      ...METRIC_COLUMNS.map((c) => r[c] as number | null),
      r.region,
      r2(r.incomeCV),
      r.months,
    ]),
    eiMonthlyCap: EI_MONTHLY_CAP,
  };
}

/** Precomputed analytics (AUCs, scenario shares, featured picks). Loaded by pipeline/load_tiger.py. */
export async function getFindings() {
  const { rows } = await pool().query(`SELECT body FROM findings WHERE id = 'main'`);
  return rows[0]?.body ?? null;
}

const SERIES_COLS = [
  "money_in", "money_out", "household_bills", "insurance", "loan_payments",
  "discretionary", "bank_fees", "pension_in", "month_end_balance",
  "avg_daily_balance", "min_balance", "days_below_zero",
] as const;

export async function getCustomer(id: number) {
  const p = pool();

  const head = await p.query(
    `SELECT m.account_id, a.account_opened::text AS opened, a.frequency,
            m.district_name, m.region, m.average_salary, m.unemployment_rate_2023,
            m."negMonths"::int AS neg_months
       FROM customer_metrics m JOIN accounts a USING (account_id)
      WHERE m.account_id = $1`,
    [id],
  );
  if (head.rowCount === 0) return null;
  const h = head.rows[0];

  const [owner, users, loan, orders, series] = await Promise.all([
    // first owner disposition, with their card type if they have one
    p.query(
      `SELECT c.gender, (2025 - EXTRACT(YEAR FROM c.birth_date))::int AS age,
              (SELECT cd.card_type FROM cards cd WHERE cd.disposition_id = d.disposition_id LIMIT 1) AS card
         FROM dispositions d JOIN clients c USING (client_id)
        WHERE d.account_id = $1 AND d.type = 'owner'
        ORDER BY d.disposition_id LIMIT 1`,
      [id],
    ),
    p.query(`SELECT count(*)::int AS n FROM dispositions WHERE account_id = $1`, [id]),
    p.query(
      `SELECT loan_start::text AS start, amount, duration_months AS months,
              monthly_payment AS payment, status, status_meaning AS meaning
         FROM loans WHERE account_id = $1 LIMIT 1`,
      [id],
    ),
    p.query(
      `SELECT amount, COALESCE(purpose, 'other') AS purpose
         FROM standing_orders WHERE account_id = $1 ORDER BY order_id`,
      [id],
    ),
    p.query(
      `SELECT to_char(month, 'YYYY-MM') AS month,
              ${SERIES_COLS.map((c) => `round(${c}::numeric, 2)::float8 AS ${c}`).join(", ")}
         FROM account_series WHERE account_id = $1 ORDER BY month`,
      [id],
    ),
  ]);

  const o = owner.rows[0];
  const l = loan.rows[0];
  return {
    id: h.account_id as number,
    opened: h.opened as string,
    frequency: h.frequency as string,
    district: h.district_name as string,
    region: h.region as string,
    districtSalary: h.average_salary as number | null,
    districtUnemployment: h.unemployment_rate_2023 as number | null,
    owner: o ? { gender: o.gender as string, age: o.age as number | null, card: (o.card as string | null) ?? null } : null,
    users: users.rows[0].n || 1,
    loan: l
      ? {
          start: l.start as string,
          amount: l.amount as number,
          months: l.months as number,
          payment: l.payment as number,
          status: l.status as string,
          meaning: l.meaning as string,
        }
      : null,
    standingOrders: orders.rows.map((s) => ({ amount: s.amount as number, purpose: s.purpose as string })),
    negMonths: h.neg_months as number,
    monthsCols: ["month", ...SERIES_COLS],
    monthsRows: series.rows.map((r) => [r.month, ...SERIES_COLS.map((c) => r[c] as number | null)]),
  };
}
