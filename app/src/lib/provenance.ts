// Where every major number comes from. Shown in the "i" tooltips next to each metric, and kept here
// in one place so the wording can't drift between pages. Nothing in this file is a number shown to a
// user: it only describes how the numbers are made.

export type ProvKind = "observed" | "derived" | "model" | "hypothetical";

export interface Provenance {
  label: string;
  /** dataset file(s) */
  source: string;
  /** column(s) used */
  columns: string;
  /** how the value is calculated */
  formula: string;
  /** which rows / months */
  period: string;
  kind: ProvKind;
}

export const KIND_LABEL: Record<ProvKind, string> = {
  observed: "Observed in the data",
  derived: "Derived from the data",
  model: "App-defined model",
  hypothetical: "Hypothetical",
};

const ALL_MONTHS = "Every monthly row on record for this account (data runs 2020-01 to 2025-12)";
const LAST6 = "The account's last 6 monthly rows, sorted by month (up to 2025-12)";

export const PROV = {
  I: {
    label: "Typical monthly money in (I)",
    source: "monthly_summary.csv",
    columns: "money_in",
    formula: "Median of the monthly money_in values",
    period: ALL_MONTHS,
    kind: "derived",
  },
  S: {
    label: "Typical monthly spending (S)",
    source: "monthly_summary.csv",
    columns: "money_out",
    formula: "Median of the monthly money_out values",
    period: ALL_MONTHS,
    kind: "derived",
  },
  F: {
    label: "Typical fixed costs (F)",
    source: "monthly_summary.csv",
    columns: "household_bills + insurance + loan_payments",
    formula: "Median of the monthly sum of the three columns",
    period: ALL_MONTHS,
    kind: "derived",
  },
  H: {
    label: "Household bills (H)",
    source: "monthly_summary.csv",
    columns: "household_bills",
    formula: "Median of the monthly household_bills values",
    period: ALL_MONTHS,
    kind: "derived",
  },
  B: {
    label: "Savings buffer (B)",
    source: "monthly_summary.csv",
    columns: "avg_daily_balance",
    formula: "Mean of avg_daily_balance over the last 6 rows",
    period: LAST6,
    kind: "derived",
  },
  P: {
    label: "Loan payment (P)",
    source: "loans.csv",
    columns: "monthly_payment, status",
    formula: "monthly_payment when status is C or D (still running at the end of 2025), otherwise 0",
    period: "Loan record as of 2025-12",
    kind: "observed",
  },
  disc: {
    label: "Flexible spending",
    source: "monthly_summary.csv",
    columns: "card_withdrawals + cash_withdrawals_genuine + transfers_out_other",
    formula: "Median of the monthly sum of the three columns",
    period: ALL_MONTHS,
    kind: "derived",
  },
  surplus: {
    label: "Monthly surplus / shortfall",
    source: "monthly_summary.csv",
    columns: "money_in, money_out",
    formula: "I − S (median money in minus median money out)",
    period: ALL_MONTHS,
    kind: "derived",
  },
  bufferMonths: {
    label: "Months of spending saved",
    source: "monthly_summary.csv",
    columns: "avg_daily_balance, money_out",
    formula: "B ÷ S",
    period: "B: last 6 rows · S: all rows",
    kind: "derived",
  },
  runway: {
    label: "Runway (months)",
    source: "monthly_summary.csv, loans.csv",
    columns: "I, S, B (above)",
    formula: "(B − one-off costs) ÷ (spending − income); 0 if the buffer is gone, 120+ if there is no shortfall; capped at 120, 1 decimal",
    period: "Datathon definition, as in the brief",
    kind: "derived",
  },
  peers: {
    label: "Similar earners",
    source: "monthly_summary.csv (all 4,500 accounts)",
    columns: "money_in, money_out, avg_daily_balance",
    formula: "Accounts in the same fifth of typical income (I); median of their B ÷ S",
    period: "Same definitions as above, for every account",
    kind: "derived",
  },
  history: {
    label: "Monthly history",
    source: "monthly_summary.csv",
    columns: "money_in, money_out, avg_daily_balance, month_end_balance, days_below_zero",
    formula: "Plotted as recorded, one point per month",
    period: ALL_MONTHS,
    kind: "observed",
  },
  shock: {
    label: "Shock values",
    source: "Your inputs or a preset",
    columns: "—",
    formula: "Income × share kept; spending + bills change × H + extra per month; one-off = multiple × S + dollars",
    period: "Starts the month after the data ends (Jan 2026) unless you pick another start",
    kind: "hypothetical",
  },
  projection: {
    label: "Month-by-month projection",
    source: "This account's I, S, B, H + the shock",
    columns: "—",
    formula: "Balance − one-off costs, then − (spending − income) each month; the shock applies for its duration, then usual income and spending resume",
    period: "Starts from the Dec 2025 buffer",
    kind: "hypothetical",
  },
  score: {
    label: "Resilience score",
    source: "monthly_summary.csv, loans.csv, standing_orders.csv",
    columns: "money_in, money_out, avg_daily_balance, loan_payments, monthly_payment, status, leasing orders",
    formula: "40% savings buffer + 25% cash flow + 20% income stability + 15% debt burden, each 0–100 from fixed curves",
    period: "Buffer: last 6 rows · stability: last 24 complete months · as of 2025-12",
    kind: "model",
  },
  rank: {
    label: "Rank, percentile and league",
    source: "rank.json (built by pipeline/build_rank.py from the CSVs)",
    columns: "score",
    formula: "Rank = 1 + number of ranked accounts with a higher 1-decimal score; Top X% = rank ÷ ranked accounts; leagues by rank: top 5% / 15% / 30% / 30% / 20%",
    period: "All eligible accounts, as of 2025-12",
    kind: "model",
  },
  rankProjection: {
    label: "Projected score and rank",
    source: "Your slider values + this account's score inputs",
    columns: "—",
    formula: "Same scoring rules re-run on the changed inputs, compared against the fixed Dec 2025 ranking",
    period: "Months after Dec 2025, for the chosen horizon",
    kind: "hypothetical",
  },
  pulseHistory: {
    label: "Account history",
    source: "monthly_summary.csv, transactions.csv, standing_orders.csv",
    columns: "money_in, money_out, days_below_zero, min_balance; amount, operation, purpose; amount, purpose",
    formula: "Last 6 vs previous 6 months; counts and sums of recorded transactions and standing orders",
    period: "The account's last 12 monthly rows",
    kind: "observed",
  },
  whatifStart: {
    label: "Starting point",
    source: "monthly_summary.csv, loans.csv",
    columns: "I, S, B, H, flexible spending, P",
    formula: "Medians of this account's monthly history; B = mean avg_daily_balance, last 6 rows",
    period: "Snapshot at 2025-12; both futures start here",
    kind: "derived",
  },
  whatifFuture: {
    label: "Branching futures",
    source: "Starting point + your decision, goals and assumptions",
    columns: "—",
    formula: "Each month: balance + income − spending (+ inflation) + one-off amounts; goals funded from one shared pot by priority",
    period: "Up to 60 months after Dec 2025",
    kind: "hypothetical",
  },
} satisfies Record<string, Provenance>;

export type ProvKey = keyof typeof PROV;
