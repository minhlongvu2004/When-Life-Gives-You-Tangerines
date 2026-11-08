# Handoff: When Life Gives You Tangerines

Written 2026-11-08. This file only records state. It changes no code.

## Branch and git status

- **Branch:** `dev-long-theme-fit` (never merged into `main`; nothing deployed).
- **Last commit:** `efeee62`, "Merge origin/superfinal into dev-long-theme-fit". It is **pushed**; the branch matched `origin/dev-long-theme-fit` before the work below.
- **Uncommitted and unpushed** (the latest work, in the working tree only):
  - modified: `app/src/components/Engine.tsx`, `guided.tsx`, `MethodTabs.tsx`; `app/src/lib/recovery.ts`, `recovery.test.ts`, `recovery.data.test.ts`
  - new: `app/src/components/StepBoundary.tsx`
  - new, untracked: this `HANDOFF.md`
- Not tracked on purpose: `cache/` (old Streamlit cache).
- To keep the work: `git add -A app HANDOFF.md && git commit`, then `git push`. To drop it, discard those files first and check with `git status`.

## What was done

Earlier commits on this branch (all pushed):
- Tangerine colour theme, fit-to-screen scaling, plain-language wording, "What if?" and "Recovery Plan" naming.
- Client ID lookup: the ID box and `?id=` links accept an account ID or a client ID (`app/public/data/clients.json`, built by `pipeline/build_client_map.py`).
- New Recovery Plan page (`RecoveryPlan.tsx`) on a tested month-by-month model (`app/src/lib/recovery.ts`): funds over time, monthly bridge, plan comparison, milestones, what-if switches, text summaries and "View as table".
- Merge of teammates' `origin/superfinal` (database routes with static fallback, What-if workspace and shock library, Rank, What If and Pulse pages, theme toggle). Conflicts in `Engine.tsx`, `guided.tsx` and `ui.tsx` were resolved: their What-if page is the base with my wording on top, and my Recovery Plan replaces their old plan page. The app defaults to light mode; the toggle still switches to dark.

Latest work (**uncommitted**):
- **Blank-page fix.** Root cause: opening the My shocks tab and then going to Recovery Plan left the content blank, with no error logged (the old step stayed mounted and invisible). This points to the page waiting for a leaving animation that never finished. `Engine.tsx` no longer waits for the old step to leave; the new step just fades in.
- **Safety net.** `StepBoundary.tsx` shows "This step didn't load" with Try again, Back to Customer and technical details if a step throws.
- **Removed** the description bar (star icon, "Describe it…", Apply) and the **My shocks** tab. `shock/CustomShocks.tsx` is now unused but still in the repo.
- **Preset flow.** Picking a preset opens **Adjust** with a "Check these values" note. The visitor edits, then presses **Confirm and see the Recovery Plan**. The extra button in the results header was removed.
- **Model hardening.** `simulateRecovery` now sanitises its inputs (a fractional duration used to throw).
- **Method page.** The four tabs are stacked in one grid cell so switching tabs no longer jumps or changes text size.

## Checks performed (final code)

- `npm test`: 165 tests pass in 11 files. They include the design walkthrough numbers, a run over all 4,500 customers, and every library preset plus extreme custom values.
- `npx eslint src` and `npx tsc --noEmit`: clean. `npm run build`: succeeds.
- Real-browser run (Playwright): 182 preset, Adjust, confirm, Recovery Plan, back-to-Customer runs on 7 customers. 174 passed with no page errors; the other 8 are presets the library switches off for that account, so they can't be clicked.
- Earlier on this code: step switching at 10 window sizes (600px to 1920px), rapid random step clicks, the month picker with odd dates, a phone-width layout with no sideways overflow, and the temporary failure test of the safety net (the switch was removed; no `__boundary_test` text remains).
- All pages respond with HTTP 200.

## Remaining issues and limits

- The blank-page cause is inferred from the evidence; I could not isolate the exact animation, and the trigger (My shocks) no longer exists to re-run.
- The database path was not exercised. Without `DATABASE_URL`, the `/api/*` routes return 503 and the app falls back to `app/public/data/*.json`. This is expected and shows as 503s in the console.
- The AI explanation route (`/api/plan`) is still in the repo but no page calls it any more, because the old plan page was replaced.
- Their What-if page still has its own help (?) tooltips, percentage fields with coarse steps, and a recovery-steps preview that uses the older plan logic. Rent in $/month with a curved slider range existed only in the earlier version.
- The step bar still lets a visitor jump straight to Recovery Plan without confirming.
- Starting funds use the 6-month average balance (the judges' definition), which can differ a lot from the latest balance. A caption on the chart explains it.
- The Recovery Plan page is long (about 3,000px) and scrolls on purpose.
- The README and `docs/` still use older words such as "shock" and "runway".
- Not tested: real screen readers, or browsers other than Chromium.

## Run the app

Needs Node 20+ (tested on v24) and Python only for the optional data scripts. From the repo root:

```bash
cd app
npm ci            # installs locked dependencies (three.js and pg are needed by the new pages)
npm run build
npm run serve     # production server on http://localhost:3000
```

- Live reload while editing: `npm run dev`.
- Deep links: `http://localhost:3000/?id=62236` (account ID) or `?id=6856613` (client ID).
- Tests and checks: `npm test`, `npx eslint src`, `npx tsc --noEmit`.
- Optional environment variables (put them in a git-ignored `.env`, never commit them): `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `RULES_VERSION`.
- Rebuild the data files from the raw CSVs (optional; the generated JSON is committed): `python pipeline/build_data.py <data folder>` and `python pipeline/build_client_map.py <data folder>`.
- After a rebuild, restart `npm run serve`, because it serves the last build. Hard-refresh the browser with Ctrl+Shift+R if you see an older version.
