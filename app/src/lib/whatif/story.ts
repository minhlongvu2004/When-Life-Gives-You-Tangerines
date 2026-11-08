// Turns simulation results into the four-chapter story and the guidance. No numbers are made up:
// each sentence reads values out of a simulated Future, and each recommendation is re-simulated
// to show its effect.

import type { Metrics } from "../engine";
import { cad, monthName, type ScenarioDef, type Stream, type YM } from "./scenarios";
import { extraNeeded, milestones, orderGoals, simulate, summarize, type Future, type Milestone, type SimInput } from "./simulate";

export type Which = "well" | "bad";

export interface StoryCtx {
  def: ScenarioDef;
  decision: string; // "take a new job paying …"
  m: Metrics;
  now: YM;
  h: number;
  well: Future;
  bad: Future;
}

export interface Chapter {
  n: number;
  title: string;
  text: string;
}

const plural = (n: number, w: string) => `${n} ${w}${Math.abs(n) === 1 ? "" : "s"}`;
const mo = (x: number) => `${cad(x)}/mo`;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const q = (name: string) => `“${name}”`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Does the scenario include a gain (new pay, savings) that the assumptions can delay or shrink? */
export function hasUpside(f: Future): boolean {
  const c = f.input.compiled;
  return c.streams.some((s) => !s.certain && (s.kind === "income" ? s.amount : -s.amount) > 0) || c.oneOffs.some((o) => !o.certain && o.amount > 0);
}
export function hasCosts(f: Future): { oneOff: boolean; monthly: boolean } {
  const c = f.input.compiled;
  return {
    oneOff: c.oneOffs.some((o) => !o.certain && o.amount < 0),
    monthly: c.streams.some((s) => !s.certain && (s.kind === "income" ? s.amount : -s.amount) < 0),
  };
}

export function assumptionPhrase(def: ScenarioDef, f: Future): string {
  const a = f.input.a;
  const parts: string[] = [];
  if (hasUpside(f)) {
    const when = a.delayMonths ? `${plural(a.delayMonths, "month")} late` : "on schedule";
    const much = a.upsidePct === 100 ? "in full" : `at ${a.upsidePct}% of what you expect`;
    parts.push(`the ${def.words.gain} arrives ${when} and ${much}`);
  }
  const c = hasCosts(f);
  if (c.oneOff || c.monthly) {
    const over = (p: number) => (p === 100 ? "on budget" : p > 100 ? `${p - 100}% over budget` : `${100 - p}% under budget`);
    if (c.oneOff && c.monthly && a.costPct === a.expensePct) parts.push(`costs come in ${over(a.costPct)}`);
    else {
      if (c.oneOff) parts.push(`one-time costs come in ${over(a.costPct)}`);
      if (c.monthly) parts.push(`new monthly costs come in ${over(a.expensePct)}`);
    }
  }
  parts.push(`everyday prices rise ${a.inflationPct}% a year`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

export function story(which: Which, ctx: StoryCtx): Chapter[] {
  const { def, m, now, h } = ctx;
  const f = which === "well" ? ctx.well : ctx.bad;
  const other = which === "well" ? ctx.bad : ctx.well;
  const s = summarize(f, h);
  const start = f.input.compiled.start;
  const P = f.points;

  // Chapter 1 — the decision
  const ch1 = `Suppose you ${ctx.decision}. The starting point is the account's latest data: ${cad(m.B)} in savings (Dec 2025), with typical money in of ${mo(
    m.I,
  )} and money out of ${mo(m.S)} over 2020–2025. In this hypothetical future, ${assumptionPhrase(def, f)}.`;

  // Chapter 2 — the first few months
  const w = Math.min(h, Math.max(3, start + 2));
  const b2: string[] = [];
  if (start > 1)
    b2.push(
      `Nothing changes until ${monthName(now, start)}; until then your savings move by about ${cad(P[1].net)} a month${start - 1 > 1 ? ` for ${plural(start - 1, "month")}` : ""}.`,
    );
  if (start > h) b2.push(`That is after the ${h}-month window you're looking at, so try a longer horizon to see the decision play out.`);
  const early = f.oneOffs.filter((o) => o.at >= 1 && o.at <= w);
  const out = early.filter((o) => o.amount < 0);
  if (out.length)
    b2.push(
      `${cap(monthName(now, out[0].at))} brings the up-front bill: ${out.map((o) => `${lc(o.label)} (${cad(-o.amount)})`).join(", ")}${
        out.length > 1 ? `, ${cad(-out.reduce((x, o) => x + o.amount, 0))} in all` : ""
      }.`,
    );
  const inn = early.filter((o) => o.amount > 0);
  if (inn.length) b2.push(`You receive ${inn.map((o) => `${lc(o.label)} (${cad(o.amount)})`).join(", ")}.`);
  const gapMonths = P.slice(start, w + 1).filter((p) => p.income < m.I * 0.5 && m.I > 0).length;
  if (which === "bad" && hasUpside(f) && f.input.a.delayMonths > 0 && start <= h)
    b2.push(`The ${def.words.gain} is ${plural(f.input.a.delayMonths, "month")} late, so ${gapMonths ? `income drops to ${mo(P[Math.min(w, start)].income)} for a while` : "the boost takes longer to show up"}.`);
  const pw = P[w];
  if (start <= w)
    b2.push(
      `By ${monthName(now, w)}, money in is ${mo(pw.income)} and money out is ${mo(pw.expenses)}, a ${pw.net >= 0 ? "surplus" : "shortfall"} of ${mo(
        Math.abs(pw.net),
      )}. Savings stand at ${cad(pw.balance)} (${pw.balance >= m.B ? "up" : "down"} ${cad(Math.abs(pw.balance - m.B))}).`,
    );
  const negEarly = P.slice(1, w + 1).find((p) => p.balance < 0);
  if (negEarly) b2.push(`In ${monthName(now, negEarly.t)} your savings dip below zero, so you'd be leaning on an overdraft or credit.`);

  // Chapter 3 — the turning point: the most important things that happen after the start
  // (chapter 2 already covered what happens at the start, so skip those unless they're big moments)
  const big: Milestone["kind"][] = ["negative", "recover", "goal", "cushion", "loan"];
  const ms = milestones(f, h, def.short).filter(
    (x) => x.kind !== "decision" && x.kind !== "low" && (x.t > w || big.includes(x.kind) || (x.kind === "income" && x.tone === "good" && x.t > start)),
  );
  const order: Milestone["kind"][] = ["negative", "recover", "goal", "income", "loan", "cushion", "event", "cost"];
  const picked = [...ms].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.t - b.t).slice(0, 3).sort((a, b) => a.t - b.t);
  let ch3: string;
  if (picked.length) {
    const byMonth = new Map<number, string[]>();
    for (const x of picked) byMonth.set(x.t, [...(byMonth.get(x.t) ?? []), x.say]);
    ch3 = [...byMonth].map(([t, says]) => `In ${monthName(now, t)}, ${says.join(" and ")}.`).join(" ");
  } else
    ch3 =
      s.avgNet >= 0
        ? `No big surprises: your savings grow by about ${mo(s.avgNet)} on average, and nothing knocks them off course within ${plural(h, "month")}.`
        : `There's no single turning point, just steady pressure: savings shrink by about ${mo(-s.avgNet)} on average over ${plural(h, "month")}.`;
  if (s.low.t >= 1 && s.low.balance < m.B && !picked.some((x) => x.kind === "low" || x.kind === "negative"))
    ch3 += ` Your lowest point is ${cad(s.low.balance)} in ${monthName(now, s.low.t)}.`;

  // Chapter 4 — your possible future at the horizon
  const os = summarize(other, h);
  const b4: string[] = [];
  b4.push(
    `By ${monthName(now, h)}, your savings are ${cad(s.balance)}${
      Number.isFinite(s.bufferMonths) && s.balance > 0 ? `, about ${s.bufferMonths.toFixed(1)} months of spending` : ""
    }, and each month ${s.net >= 0 ? `adds ${cad(s.net)}` : `costs you ${cad(-s.net)} more than comes in`}.`,
  );
  const done = s.goals.filter((g) => g.reachedByH);
  const pending = s.goals.filter((g) => !g.reachedByH);
  if (done.length) b4.push(`You've ${done.map((g) => `${g.outcome.goal.spend ? "paid for" : "fully saved"} ${g.outcome.goal.name}`).join(" and ")}.`);
  for (const g of pending.filter((x) => x.dipped).slice(0, 2))
    b4.push(`${g.outcome.goal.name} was full earlier, but the costs of this decision draw it down to ${Math.round(g.progress * 100)}%.`);
  for (const g of pending.filter((x) => !x.dipped).slice(0, 3)) {
    const r = g.outcome.reachedAt;
    b4.push(
      `${g.outcome.goal.name} is ${Math.round(g.progress * 100)}% funded; ${
        r === null ? "at this pace it isn't reached within 5 years" : `it lands in ${monthName(now, r)}${r > g.outcome.targetAt ? `, ${plural(r - g.outcome.targetAt, "month")} after your target` : ""}`
      }.`,
    );
  }
  if (s.firstNegative !== null && s.balance < 0) b4.push(`You're still below zero, so this future needs a backup plan.`);
  const diff = s.balance - os.balance;
  if (Math.abs(diff) >= 1)
    b4.push(`That's ${cad(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than if it goes ${which === "well" ? "badly" : "well"}.`);

  return [
    { n: 1, title: "The Decision", text: ch1 },
    { n: 2, title: "The Beginning", text: b2.join(" ") || `The first months pass quietly; savings move by about ${mo(P[1].net)}.` },
    { n: 3, title: "The Turning Point", text: ch3 },
    { n: 4, title: "Your Possible Future", text: b4.join(" ") },
  ];
}

/* ------------------------------------------------------------------ guidance */

export interface Tip {
  title: string;
  detail: string;
  impact?: string;
}

const rerun = (f: Future, patch: Partial<SimInput>) => simulate({ ...f.input, ...patch });
const withLever = (f: Future, s: Stream[]) => rerun(f, { levers: [...(f.input.levers ?? []), ...s] });

const DELAY_ADVICE: Partial<Record<ScenarioDef["kind"], string>> = {
  job: "Get the start date in writing before you give notice",
  school: "Line up work or a co-op before you graduate",
  side: "Launch on time and find your first customers early",
  save: "Make it automatic from day one",
  spend: "Make the changes stick from day one",
};

function goalShift(a: Future, b: Future, id: string): number | null {
  const x = a.goals.find((g) => g.goal.id === id)?.reachedAt ?? null;
  const y = b.goals.find((g) => g.goal.id === id)?.reachedAt ?? null;
  if (x === null || y === null) return null;
  return x - y; // positive = b reaches it sooner
}

export function guidance(ctx: StoryCtx): { good: Tip[]; bad: Tip[] } {
  const { def, m, now, h, well, bad } = ctx;
  const sw = summarize(well, h);
  const sb = summarize(bad, h);
  const good: Tip[] = [];
  const prep: Tip[] = [];

  // ---- make the good future more likely
  if (hasUpside(well)) {
    const late = rerun(well, { a: { ...well.input.a, delayMonths: well.input.a.delayMonths + 1 } });
    const cost = sw.balance - summarize(late, h).balance;
    if (cost > 1)
      good.push({
        title: DELAY_ADVICE[def.kind] ?? "Keep the plan on schedule",
        detail: `Every month the ${def.words.gain} is late costs about ${cad(cost)} in savings by ${monthName(now, h)}.`,
        impact: `${cad(cost)} per month of delay`,
      });
  }
  for (const g of summarize(well, h).goals) {
    if (g.onTime) continue;
    const need = extraNeeded(well.input, g.outcome.goal.id);
    const target = monthName(now, g.outcome.targetAt);
    if (need === null)
      good.push({
        title: `Re-plan ${q(g.outcome.goal.name)}`,
        detail:
          g.outcome.reachedAt !== null
            ? `It can't be ready by ${target} even with extra saving. On this plan it lands in ${monthName(now, g.outcome.reachedAt)}, so move the date or lower the target.`
            : `It isn't reached within 5 years on this plan. Lower the target, push the date out, or free up more money each month.`,
      });
    else if (need > 0)
      good.push({
        title: `Save ${mo(need)} more for ${q(g.outcome.goal.name)}`,
        detail: `That extra amount, starting next month, gets it funded by ${target} instead of ${
          g.outcome.reachedAt === null ? "not within 5 years" : monthName(now, g.outcome.reachedAt)
        }.`,
        impact: `On time by ${target}`,
      });
  }
  if (m.disc > 0 && def.kind !== "spend") {
    const cut = 0.1 * m.disc;
    const t = withLever(well, [{ label: "Trim flexible spending", kind: "expense", amount: -cut, from: 1, certain: true }]);
    const gain = summarize(t, h).balance - sw.balance;
    const sooner = well.goals
      .map((g) => ({ g, d: goalShift(well, t, g.goal.id) }))
      .filter((x) => x.d !== null && x.d > 0)
      .sort((a, b) => (b.d ?? 0) - (a.d ?? 0))[0];
    good.push({
      title: `Trim flexible spending 10% (${mo(cut)})`,
      detail: `Your card, cash and other transfers out average ${mo(m.disc)}. Trimming 10% adds ${cad(gain)} to savings by ${monthName(now, h)}${
        sooner ? ` and gets ${q(sooner.g.goal.name)} done ${plural(sooner.d!, "month")} sooner` : ""
      }.`,
      impact: `+${cad(gain)} by month ${h}`,
    });
  }
  const early = sw.goals.filter(
    (g) => g.reachedByH && g.onTime && g.outcome.reachedAt !== null && g.outcome.reachedAt >= 1 && g.outcome.targetAt - g.outcome.reachedAt >= 2,
  );
  if (early.length && sw.net > 0)
    good.push({
      title: "You have room to aim higher",
      detail: `${early.map((g) => `${g.outcome.goal.name} lands ${plural(g.outcome.targetAt - g.outcome.reachedAt!, "month")} early`).join("; ")}. Raise a target or add another goal so the ${mo(
        sw.net,
      )} surplus keeps working.`,
    });
  if (!well.goals.length)
    good.push({
      title: "Give your surplus a job",
      detail:
        sw.net > 0
          ? `This future leaves about ${mo(sw.net)} spare by ${monthName(now, h)}. Add a goal above to see when it gets you there.`
          : `Add a goal above to see what this decision does to it.`,
    });

  // ---- prepare for the difficult future
  if (sb.low.balance < 0) {
    const need = -sb.low.balance;
    const surplus = m.I - m.S;
    const monthsToSave = surplus > 0 ? Math.ceil(need / surplus) : null;
    prep.push({
      title: `Build a ${cad(need)} cushion first`,
      detail: `If it goes badly, your savings fall to ${cad(sb.low.balance)} in ${monthName(now, sb.low.t)}. ${
        monthsToSave !== null
          ? `At your usual surplus of ${mo(surplus)}, saving that takes about ${plural(monthsToSave, "month")}, so you could wait until ${monthName(
              now,
              bad.input.compiled.start + monthsToSave,
            )} to start.`
          : `Your usual spending already matches or beats your income, so this cushion has to come from cutting costs or a cheaper version of the plan.`
      }`,
      impact: `Avoids ${plural(sb.negativeMonths, "month")} below zero`,
    });
  } else {
    const three = 3 * m.S;
    prep.push(
      sb.low.balance < three
        ? {
            title: "Don't stack another big purchase",
            detail: `Even if it goes badly you stay above zero, but savings bottom out at ${cad(sb.low.balance)} in ${monthName(now, sb.low.t)}. That's under 3 months of your spending (${cad(
              three,
            )}), so hold off on other big costs until you're past that point.`,
          }
        : {
            title: "You can absorb a rough start",
            detail: `In the difficult future your savings never drop below ${cad(sb.low.balance)}, still more than 3 months of your spending (${cad(three)}).`,
          },
    );
  }
  const overrun = sb.oneOffTotal - sw.oneOffTotal; // negative = bad pays more
  if (overrun < -1)
    prep.push({
      title: `Set aside ${cad(-overrun)} for overruns`,
      detail: `The difficult future assumes one-time costs come in ${bad.input.a.costPct - 100}% over your estimate. Ring-fencing that amount now means a surprise bill doesn't eat your goals.`,
    });
  if (m.disc > 0 || m.P > 0) {
    const s0 = Math.max(1, bad.input.compiled.start);
    const lv: Stream[] = [];
    if (m.disc > 0) lv.push({ label: "Survival-mode spending", kind: "expense", amount: -0.25 * m.disc, from: s0, to: s0 + 5, certain: true });
    if (m.P > 0 && (bad.input.loanEndsAt === null || bad.input.loanEndsAt >= s0))
      lv.push({ label: "Loan payment deferred", kind: "expense", amount: -m.P, from: s0, to: s0 + 5, certain: true });
    const t = withLever(bad, lv);
    const st = summarize(t, h);
    const deferLoan = lv.some((s) => s.label === "Loan payment deferred");
    const parts = [m.disc > 0 ? `cut flexible spending 25% (${mo(0.25 * m.disc)})` : "", deferLoan ? `ask your lender to defer the ${mo(m.P)} loan payment` : ""].filter(Boolean);
    if (parts.length && st.low.balance - sb.low.balance > 1)
      prep.push({
        title: "Have a 6-month survival mode ready",
        detail: `If things go wrong, ${parts.join(" and ")} for the first 6 months. Your lowest point improves from ${cad(sb.low.balance)} to ${cad(st.low.balance)}.`,
        impact: `+${cad(st.low.balance - sb.low.balance)} at the low point`,
      });
  }
  const lateBad = sb.goals.filter((g) => !g.onTime);
  const ordered = orderGoals(bad.input.goals);
  if (lateBad.length && ordered.length >= 2) {
    const top = ordered[0];
    const drop = ordered[ordered.length - 1];
    const t = rerun(bad, { goals: bad.input.goals.filter((g) => g.id !== drop.id) });
    const d = goalShift(bad, t, top.id);
    if (d !== null && d > 0)
      prep.push({
        title: `Pause ${q(drop.name)} to protect ${q(top.name)}`,
        detail: `${q(top.name)} is your top priority. Putting ${q(drop.name)} on hold gets it done ${plural(d, "month")} sooner if things go badly.`,
      });
    else
      prep.push({
        title: "Expect some goals to slip",
        detail: `If it goes badly, ${lateBad.map((g) => q(g.outcome.goal.name)).join(", ")} ${lateBad.length === 1 ? "misses its" : "miss their"} target date. Decide now which one you'd delay first.`,
      });
  }
  if (sb.net < 0 && sb.h >= 3)
    prep.push({
      title: "Close the monthly gap",
      detail: `By ${monthName(now, h)} this future still spends ${mo(-sb.net)} more than it earns. Savings can't cover that forever, so plan which cost goes first.`,
    });

  return { good: good.slice(0, 4), bad: prep.slice(0, 4) };
}
