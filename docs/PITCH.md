# Pitch & live-twist playbook

Judging: Discovery 35% · Data Use 25% · Communication 25% · Impact 15%. About 5 minutes in total.

## Before you walk up (setup checklist)

- [ ] **Well before judging:** `cd app && npm install && npm run build`. This takes about 30 seconds and needs internet only for `npm install`.
- [ ] **At the table:** `cd app && npm run serve`, then open http://localhost:3000. It loads instantly and needs no internet. Don't use `npm run dev` for judging: its first page load takes about 30 seconds.
- [ ] Browser zoom at 110–125% so judges can read it. Close other tabs.
- [ ] Open three tabs: **Engine** (`/?id=52783`), **The finding** (`/finding`) and **Method** (`/method`).
- [ ] Mode toggle on **Judge definitions**.

---

## 1-minute pitch (about 150 words)

> "Two real customers from this dataset. **Customer 52783** earns **$22,300** a month. **Customer 97509** earns **$2,100**. Ten times less.
> Both get laid off tomorrow. Who lasts longer?
>
> *(beat)* The low earner lasts **84 months**. The high earner lasts **2.1**.
>
> That's not a fluke. It's our biggest finding across all 4,500 accounts: **the more you earn, the fewer months you can survive.**
> *(switch to The finding tab)* The top-earning fifth keeps 1.8 months of spending in the bank; the lowest keeps 8.5. Under your
> job-loss twist, **70%** of top earners don't make 6 months. And the brief's 55% rule is generous: real EI caps at **$729 a week**. With the cap it's **99%**.
>
> So we built **When Life Gives You Tangerines**: know the customer, take any shock, get a plan. Every number matches your
> definitions exactly. We checked 36,000 cases against a Python reference. Hand us a customer."

## 3-minute live twist: the routine

1. **Type the account_id** in the big box and press Enter. Say: *"Typical month: in **$I**, out **$S**, buffer **$B**, which is **X months** of their own spending. Today's runway: …"*
2. **Read the twist card into the "Read a twist card" box** and press Enter (or click the matching quick twist). The parser shows what it understood under the box. Check it, and fix any slider if needed.
3. Point at the **big runway number**. Say: *"Runway drops from A to **B months**."* Then read the **verdict badge** ("Makes it through 6 months" / "Runs out N months early, needs $X more").
4. Open **Show the math**: *"buffer_left = …, gap = …, B ÷ gap = …"*. This is the trust moment, and it matches the judges' worked answer.
5. Point at the **Realistic** chip next to it: *"With the real EI cap it's actually R months."* Use this only for higher earners, where the difference is dramatic.
6. Scroll to **Make a plan**:
   - **Backup plan:** *"Day 1 file EI, then trim flexible spending 10% (+X months), defer the loan (+Y), survival mode (+Z). With the full plan they [make it / still fall short]."*
   - **Goal plan:** *"To be ready next time: target $T, save $M a month, fully funded in N months."*
7. Close with the population line under the chart: *"Under this twist, P% of all customers run out within 6 months. This customer outlasts Q% of them."*

### Twist cheat sheet

| Twist card says | Do this |
| :-- | :-- |
| "Laid off, EI 55% for 6 months" | Quick twist **Laid off · EI 55%** (sets income 55%, 6 months) |
| "Furnace dies, costs a month of spending" | Quick twist **Furnace dies** (one-off = 1 × S) |
| "Job loss + bills up 15%" | Quick twist **Laid off + bills +15%** |
| "Rent goes up $400" | Slider **Other extra monthly cost** = 400 |
| "Repair costs $5,000" | Slider **Surprise one-off cost ($)** = 5,000 |
| "EI at 50% for 9 months" | Type the card into the box (sets 50% and 9 months) |
| Something odd | Sliders. Every input is one drag away |

**Runway edge cases to say out loud:** if the buffer goes to 0 or below after a one-off, runway = **0** (they can't absorb it). If income still covers spending, it's **"no shortfall (120+)"**.

---

## Backup demo accounts

| ID | Why it's useful | Job loss (judge) | Realistic |
| :-- | :-- | :-- | :-- |
| **52783** | High earner ($22.3K/mo), thin buffer. **The furnace alone wipes them out (runway 0)** | 2.1 mo | 1.1 mo |
| **97509** | Low earner ($2.1K/mo), deep savings | 83.8 mo | 83.8 mo |
| **43402** | Pensioner: realistic mode keeps the pension, so no shortfall | 42.4 mo | 120+ |
| **76493** | Running loan (in debt), already short every month | 0.8 mo | 0.8 mo |

---

## Q&A prep

- **"Why do your numbers differ from ours?"** They don't in Judge mode: it's your definitions verbatim, verified on 36,000 cases. Realistic mode is labelled and shown next to it: EI is capped at $729/week (canada.ca, 2026), and pensions don't stop when a job does.
- **"Why medians?"** Yours, and they're robust: one bonus month or one big purchase doesn't move the typical month.
- **"How do you pick the emergency-fund target?"** The larger of 6 × the monthly gap on EI (so they survive a full 6-month claim) and 3 × fixed costs. It's personal, not a generic "3–6 months".
- **"What counts as flexible spending?"** Card spending, genuine cash withdrawals and unlabelled transfers out. Bills, insurance, loans and fees are must-pay. It's a heuristic: cash can hide rent, so we cut only 10%, then 25% in survival mode.
- **"Is the finding just pensioners?"** No. Toggle "Excluding pensioners" on the finding page: buffers still fall from 8.9 to 1.8 months as income rises.
- **"Couldn't overdrafts predict default?"** They look perfect (every defaulter had one), but that's leakage: being in debt *is* the default. We use only months before each loan. Income volatility then still predicts default 6× (AUC 0.71).
- **"Impact for Tangerine?"** Flag high earners with under 2 months of buffer and income volatility for a proactive savings nudge, before a layoff, not after.
- **Limitations:** the data is a historical European bank dataset converted to CAD, and regions don't map to Canadian cities. Shock duration is used only for the verdict; the runway formula assumes the shock lasts.
