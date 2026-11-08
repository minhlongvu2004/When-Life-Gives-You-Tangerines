# When Life Gives You Tangerines — design

Sheridan Datathon 2026, Tangerine track "Resilience Rewired". Goal: win the track (and 1st overall + Best Data Viz).
Judging: Discovery 35%, Data Use 25%, Communication 25%, Impact 15%. 5-minute slot: 1-min pitch, 3-min live twist on a judge-picked `account_id`, 1-min Q&A.

The user handed every product and technical decision to Claude ("make me a project that wins"). Everything below is Claude's call.

## Intent

A financial-resilience engine that, for any account, (1) shows the customer's money picture, (2) applies any shock live with sliders, (3) produces a goal plan and a backup plan from the customer's own numbers — and tells one surprising story backed by the data.

## Headline finding (Discovery)

**"The more you earn, the fewer months you can survive."** Savings buffers do not scale with spending: the lowest-income fifth holds ~8.9 months of spending as buffer, the highest fifth ~1.8. Under the judges' job-loss twist (EI 55%), 5% of the lowest fifth vs 70% of the highest fifth fail to last 6 months. With the real 2026 EI cap ($729/week, canada.ca), essentially the entire top fifth fails. The judges' flat-55% rule overstates high earners' safety.

Supporting (pre-loan signals only — post-loan overdraft is label leakage, status D = "in debt"): income volatility before the loan (AUC ≈ 0.71; top quartile 23% default vs 4%) and payment-to-income ratio.

## Goals

- Numbers match the judges' definitions exactly (1-decimal runway) for every account and every twist. Zero mismatches in a golden test across all 4,500 accounts.
- Live twist in seconds: presets for the brief's examples + sliders + combinable shocks. No network/API key on the demo path.
- "Show the math" panel: the judges' formula with this customer's numbers plugged in.
- Toggle "Judge definitions" ↔ "Realistic" (EI capped at $729/wk; pension income is not lost in a job loss), with a one-line explanation of why numbers differ.
- Goal plan + backup plan computed from the customer's numbers, each step showing months of runway gained.
- A findings page with one strong interactive chart (also targets Best Data Viz).
- Deliverables: pitch script, demo-video script, Devpost write-up, sources and credits.

## Non-goals / anti-goals

- No sponsor-API integrations (Gemini, Snowflake, etc.): they add network risk to a live demo.
- No ML black box: every number must be explainable in one sentence.
- Never show a number that disagrees with the judges' without labelling it "Realistic" and saying why.
- No Tangerine logo or branding imitation; orange palette and the track name only.

## Architecture

- `pipeline/` (Python, pandas): reads the raw data folder (git-ignored), computes per-account metrics with exact pandas semantics (medians, last-6-month mean of `avg_daily_balance` sorted by month, P from loan status C/D), writes `app/public/data/metrics.json` (all accounts, compact), `app/public/data/accounts/<id>.json` (monthly series), `app/public/data/findings.json`, and `pipeline/golden.json` (expected runways for many account×shock cases). Reference runway function lives here.
- `app/` (Next.js + TypeScript + Tailwind, static export): the browser only does runway arithmetic on precomputed inputs, in the same operation order as Python, with Python-compatible rounding. Vitest golden test compares the TS engine against `golden.json`.
- Runway order of checks: `buffer_left <= 0 → 0`, then `gap <= 0 → "no shortfall (120+)"`, else `min(buffer_left/gap, 120)` rounded to 1 decimal.

## Shock model

Income multiplier (job loss / EI 55%), household-bills increase % (× H), extra monthly cost ($), one-off cost ($ or × S), shock duration (months EI lasts, for the "do they make it?" verdict). Realistic mode: EI capped at $3,159/month and applied to non-pension income only; pension continues.

## Plans

- Goal plan: emergency fund that survives a 6-month EI job loss (target = 6 × job-loss gap, min 3 × S); monthly contribution from surplus; months to reach. If no surplus, propose discretionary cuts (card withdrawals, genuine cash withdrawals, unlabelled transfers out) to create one.
- Backup plan (if the shock hits): ordered actions — file EI immediately, cut discretionary 10/25%, pause loan payment P — each showing runway gained.

## Left to the builder

Visual design details, chart choices, copy wording, featured example accounts.
