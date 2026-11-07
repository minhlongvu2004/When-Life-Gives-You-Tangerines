# Pitch & live-twist playbook

Judging: Discovery 35% · Data Use 25% · Communication 25% · Impact 15%. About 5 minutes in total.

## Before you walk up (setup checklist)

- [ ] **Well before judging:** `cd app && npm install && npm run build`. This takes about 30 seconds and needs internet only for `npm install`.
- [ ] **At the table:** `cd app && npm run serve`, then open http://localhost:3000. It loads instantly and needs no internet. Don't use `npm run dev` for judging: its first page load takes about 30 seconds.
- [ ] Browser zoom at 110–125% so judges can read it. Close other tabs.
- [ ] Open two tabs: **Engine** (`/`) and **Finding** (`/finding`). Method (`/method`) is there if a judge asks how you computed something.
- [ ] Mode toggle on **Judge definitions**.

---

## 1-minute pitch (about 150 words)

> "Two real customers from this dataset. **Customer 52783** earns **$22,300** a month. **Customer 97509** earns **$2,100**. Ten times less.
> Both get laid off tomorrow. Who lasts longer?
>
> *(beat)* The low earner lasts **84 months**. The high earner lasts **2.1**.
>
> That's not a fluke. It's our biggest finding across all 4,500 accounts: **the more you earn, the fewer months you can survive.**
> *(switch to The finding tab)* The top-earning fifth keeps 1.8 months of spending in the bank; the lowest keeps 8.9 (working-age customers). Under your
> job-loss twist, **70%** of top earners don't make 6 months. And the brief's 55% rule is generous: real EI caps at **$729 a week**. With the cap it's **99%**.
>
> So we built **When Life Gives You Tangerines**: know the customer, take any shock, get a plan. Every number matches your
> definitions exactly. We checked 36,000 cases against a Python reference. Hand us a customer."

## 3-minute live twist: the routine

The app walks you through three steps: **1 Customer → 2 Shock → 3 Plan**. Say one sentence per screen.

1. **Type the account_id** on the home screen and press Enter.
   Read the headline, for example *"Saving $482 a month… but their savings cover only 0.9 months of spending."*
2. Click **Hit them with a shock**. **Type the twist card** into the bar at the top and press Enter, or tap the matching scenario card.
   Read the headline aloud, for example *"They run out of money in month 3, 3.9 months short."*
3. If a judge wants proof, click **Math**. A side panel shows the judges' formula with this customer's numbers in it. For a layoff, tap the **Real EI cap** chip to show the realistic number.
4. Click **Make a plan**. Read the two big numbers:
   - Left (*if it hits*): *"Runway goes from 2.1 to 3.9 months with these three moves."*
   - Right (*get ready*): *"Save $2.0K a month and they're fully ready in 19 months."*
5. Click the **×** on the customer pill to load the next one.

### Twist cheat sheet

| Twist card says | Do this |
| :-- | :-- |
| "Laid off, EI 55% for 6 months" | Card **Laid off** (income 55%, 6 months) |
| "Furnace dies, costs a month of spending" | Card **Furnace dies** (one-off = 1 × S) |
| "Job loss + bills up 15%" | Card **Laid off + bills up** |
| "Rent goes up $400" | Type it, or **Adjust → Extra monthly cost** = 400 |
| "Repair costs $5,000" | Type it, or **Adjust → One-off cost ($)** = 5,000 |
| "EI at 50% for 9 months" | Type the card into the box (sets 50% and 9 months) |
| Something odd | **Adjust**. Every input is one slider |

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
