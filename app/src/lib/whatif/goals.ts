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
  hint?: (m: Metrics, loanEndsAt: number | null) => string | null;
}

const r500 = (x: number) => Math.max(500, Math.round(x / 500) * 500);

export const GOAL_TEMPLATES: GoalTemplateDef[] = [
  {
    template: "emergency",
    label: "Emergency fund",
    name: "Emergency fund",
    spend: false,
    priority: "high",
    months: 12,
    target: () => 10000,
    hint: (m) => `3 months of your spending is about $${Math.round(3 * m.S).toLocaleString("en-CA")}`,
  },
  { template: "car", label: "Buy a car", name: "Buy a car", spend: true, priority: "medium", months: 24, target: () => 20000 },
  { template: "house", label: "Save for a house", name: "House down payment", spend: false, priority: "medium", months: 36, target: () => 30000 },
  {
    template: "loan",
    label: "Pay off a loan",
    name: "Pay off my loan",
    spend: true,
    priority: "high",
    months: 18,
    // loans.csv: amount = duration × payment, so what's left is payment × payments remaining
    target: (m, end) => (m.P > 0 && end !== null && end > 0 ? Math.round(m.P * end) : 5000),
    hint: (m, end) =>
      m.P > 0 && end !== null && end > 0
        ? `From your loan record: ${end} payments of $${Math.round(m.P).toLocaleString("en-CA")} left. Paying it off frees that every month.`
        : null,
  },
  { template: "education", label: "Save for education", name: "Education fund", spend: true, priority: "medium", months: 24, target: () => 8000 },
  { template: "vacation", label: "Save for vacation", name: "Vacation", spend: true, priority: "low", months: 10, target: () => 3000 },
  { template: "custom", label: "Custom savings goal", name: "My goal", spend: false, priority: "medium", months: 12, target: (m) => r500(m.S) },
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
