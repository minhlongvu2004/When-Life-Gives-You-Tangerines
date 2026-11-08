import type { Metrics } from "../engine";
import { addMonths, ymString, type YM } from "./scenarios";
import type { Goal, GoalTemplate, Priority } from "./simulate";

export interface GoalTemplateDef {
  template: GoalTemplate;
  label: string;
  name: string;
  spend: boolean;
  priority: Priority;
  months: number; // default months until the target date
  target: (m: Metrics, loanEndsAt: number | null) => number;
  /** Where the default target comes from: the account's own data, or a round example the user should replace. */
  basis: (m: Metrics, loanEndsAt: number | null) => "data" | "example";
  hint?: (m: Metrics, loanEndsAt: number | null) => string | null;
}

const r500 = (x: number) => Math.max(500, Math.round(x / 500) * 500);
const hasLoan = (m: Metrics, end: number | null) => m.P > 0 && end !== null && end > 0;
const example = () => "example" as const;

export const GOAL_TEMPLATES: GoalTemplateDef[] = [
  {
    template: "emergency",
    label: "Emergency fund",
    name: "Emergency fund",
    spend: false,
    priority: "high",
    months: 12,
    // 3 months of this account's typical spending (median money_out), rounded to $500
    target: (m) => r500(3 * m.S),
    basis: (m) => (m.S > 0 ? "data" : "example"),
    hint: (m) =>
      m.S > 0
        ? `Default = 3 × your typical monthly spending of $${Math.round(m.S).toLocaleString("en-CA")} (median money_out), rounded to $500.`
        : "No regular spending on record, so this is an example amount. Enter your own target.",
  },
  { template: "car", label: "Buy a car", name: "Buy a car", spend: true, priority: "medium", months: 24, target: () => 20000, basis: example },
  { template: "house", label: "Save for a house", name: "House down payment", spend: false, priority: "medium", months: 36, target: () => 30000, basis: example },
  {
    template: "loan",
    label: "Pay off a loan",
    name: "Pay off my loan",
    spend: true,
    priority: "high",
    months: 18,
    // loans.csv: amount = duration × payment, so what's left is payment × payments remaining
    target: (m, end) => (hasLoan(m, end) ? Math.round(m.P * end!) : 5000),
    basis: (m, end) => (hasLoan(m, end) ? "data" : "example"),
    hint: (m, end) =>
      hasLoan(m, end)
        ? `From loans.csv: ${end} payments of $${Math.round(m.P).toLocaleString("en-CA")} left after Dec 2025. Paying it off frees that every month.`
        : "No running loan on record for this account, so this is an example amount for a loan held elsewhere. Enter the real balance.",
  },
  { template: "education", label: "Save for education", name: "Education fund", spend: true, priority: "medium", months: 24, target: () => 8000, basis: example },
  { template: "vacation", label: "Save for vacation", name: "Vacation", spend: true, priority: "low", months: 10, target: () => 3000, basis: example },
  { template: "custom", label: "Custom savings goal", name: "My goal", spend: false, priority: "medium", months: 12, target: (m) => r500(m.S), basis: (m) => (m.S > 0 ? "data" : "example") },
];

let seq = 0;
export function newGoal(t: GoalTemplateDef, m: Metrics, now: YM, loanEndsAt: number | null): Goal {
  seq += 1;
  return {
    id: `g${Date.now().toString(36)}${seq}`,
    template: t.template,
    name: t.name,
    target: t.target(m, loanEndsAt),
    targetDate: ymString(addMonths(now, t.months)),
    priority: t.priority,
    spend: t.spend,
  };
}
