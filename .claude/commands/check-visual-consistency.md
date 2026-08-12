# Visual Consistency Check

Walk new/changed UI against `docs/guides/design-qa-checklist.md` in a live browser. Fix violations in place.

**Not a `/create-pr` gate.** Unlike `check-conventions`/`check-terminology`/`check-ux-writing`, this requires a running dev server and Chrome automation (contrast/focus measurement can't be done from a diff alone). Invoke manually during a design-polish round, not automatically on every PR.

## Step 1 — Identify target screens

1. Determine the base branch and run `git diff main...HEAD --stat` (or `git diff HEAD --stat`) to find changed `.tsx` files under `apps/web/src`.
2. From the changed files, identify the routes/screens they render into (check `apps/web/src/app/router.tsx` for the owning route). No new/changed screens → report "No UI screens to check" and stop.
3. Confirm test data exists to reach each screen while logged in (a real record, or a mock flag) — if not, ask the user how to reach it rather than guessing.

## Step 2 — Load the checklist

Read `docs/guides/design-qa-checklist.md` in full (categories, anchor sources, measurement snippets, severity tiers).

## Step 3 — Start dev + capture

1. Start the dev server needed to reach the target screens (`pnpm dev` for real backend data, `pnpm dev:web` if staging API is sufficient). Kill any process already on the target port first.
2. For each target screen, in light and in dark:
   - Screenshot the settled state (not mid-loading, unless loading state itself is in scope).
   - Walk categories 1–5 from the checklist in order. For any category where the checklist specifies a measurement technique (contrast, computed style, keyboard focus), run it — do not judge from the screenshot alone.
   - Before flagging a color/opacity value, grep the rest of the app for existing usage of the same token to check whether it's a new deviation or an established convention.

## Step 4 — Triage

Classify every measured finding using the severity table in `design-qa-checklist.md`:
- **막힘 (Blocking)** — fix immediately, before continuing the sweep.
- **이번 라운드 반영 (This round)** — collect for a single batch fix at the end.
- **백로그 (Backlog)** — record with rationale, do not fix now.

## Step 5 — Fix and re-verify

1. Apply all "이번 라운드 반영" fixes in one batch (not one-by-one).
2. Re-verify each fix with the same measurement technique used to flag it (re-screenshot alone is not sufficient — e.g. re-run the contrast calc, re-check `document.activeElement` after a real Tab press).
3. Run `pnpm --filter web typecheck` and `pnpm --filter web lint`.
4. Stop the dev server.

## Step 6 — Report

- No findings survive measurement → output: `Visual consistency check passed.`
- Findings fixed or backlogged → output two tables:

```
### Fixed

| File | Finding | Evidence (measured) |
|------|---------|----------------------|
| ...  | ...     | ...                  |

### Backlog

| Finding | Why deferred |
|---------|--------------|
| ...     | ...          |
```

## Constraints

- Never flag a finding from a screenshot alone if `design-qa-checklist.md` specifies a measurement technique for that category — run it first.
- Only apply rules from `docs/guides/design-qa-checklist.md` (which itself points to wireframe/weave tokens/WCAG/CLAUDE.md conventions). Do not flag based on personal preference.
- Kill the dev server you started before finishing, even if the check is interrupted.
