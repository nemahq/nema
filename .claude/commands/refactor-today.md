# Refactor Today's Merged PRs

Sweep today's PRs merged into `staging`, apply the same architecture/convention judgment as `check-conventions`, and propose the fixes as a stacked chain of small PRs — one meaningful unit per PR, each based on the previous unit — instead of checking the current branch's diff or fixing in place.

## Step 1 — Collect target PRs

1. Determine the author filter: default to the current git user (`gh api user --jq .login`). If invoked with an explicit author argument, use that instead.
2. Determine "today": local midnight (Asia/Seoul) converted to the UTC boundary `gh search` expects.
3. Run:
   ```
   gh pr list --repo nemahq/nema --base staging --state merged \
     --author <author> --search "merged:>=<today 00:00 KST as UTC>" \
     --json number,title,mergedAt,mergeCommit,labels
   ```
   - No PRs found → report "오늘 대상 PR 없음" and stop.
4. For each PR, fetch its diff: `gh pr diff <number>`.
5. Filter out low-value PRs before doing any deep work:
   - Labeled `documentation` or translation-only diffs (only `lib/tolgee/**` / `infra/i18n/locales/**` JSON changed).
   - Diffs confined to non-logic files (e.g. only `*.md`, only lockfile).
   - Diff under a trivial size (a handful of lines with no new components/functions).
   - Record each skip with its reason — do not silently drop it.
6. Note: this scope only ever sees PRs whose base was `staging` directly. A sub-PR merged into a shared feature branch (per the stacked-PR merge convention in CLAUDE.md) won't appear here — that's intentional; it gets swept once the feature branch itself merges into `staging`.

## Step 2 — Determine scope (per candidate PR)

Same as `check-conventions.md` Step 2: identify affected packages (`apps/web`, `apps/server`, `packages/weave`, other) from the PR's changed file paths.

## Step 3 — Load conventions

Same as `check-conventions.md` Step 3 — read all applicable `conventions.md` + `CLAUDE.md` sources for the PR's affected packages.

## Step 4 — Build checklist

Same as `check-conventions.md` Step 4 — extract every relevant section heading as a checklist category.

## Step 5 — Check and fix

Same as `check-conventions.md` Step 5, with one addition:

- **Respect intentional exceptions.** If the code already carries a comment explaining why it deliberately departs from a convention, do not flag it as a violation — read the full surrounding context before treating anything as a fix candidate, especially for logic you did not just write yourself.

Do not fix in place on the merged commit. Stage all fixes on the working branch created in Step 6.

## Step 5b — Architecture check

Same as `check-conventions.md` Step 5b.

## Step 6 — Iteratively branch, fix, and open a PR chain

All violations found across every candidate PR (Step 5/5b) form one shared pool of "meaningful units" — units are not 1:1 with the original PRs. Process this pool as a loop that grows a single stacked PR chain for the day, not one isolated PR per candidate.

1. **Find the chain's current tip**:
   - `gh pr list --head "refactor/<today's date, YYYY-MM-DD>-*" --state open` — if any exist, the chain is already in progress. Resume from the highest-numbered unit's branch.
   - None found → the chain starts fresh from the current `staging` tip.
2. **Loop** until no meaningful unit remains in the pool:
   1. Pick ONE unit — sized to stay independently reviewable in one sitting (e.g., one responsibility-tier violation in one feature area), not a grab-bag of everything left.
      - No unit meets that bar anymore → stop the loop, go to Step 7.
   2. `wt-pool status` → `grab` an idle worktree.
   3. Branch `refactor/<today's date>-<NN>` (zero-padded sequence, e.g. `refactor/2026-07-27-01`) off the **chain's current tip** (the previous unit's branch, or `staging` if this is the first unit) — never off `staging` directly once the chain has started.
   4. Apply this unit's fix only.
   5. **Verify CI locally** (mirrors `.github/workflows/ci.yml`'s `check` job): `pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip && pnpm depcruise && pnpm build`. If the diff touches `apps/server/`, `packages/shared/src/`, or `supabase/migrations/`, also run `supabase start` (local) before `pnpm test`, then `supabase stop`. Otherwise `pnpm test` without spinning up Supabase.
   6. `gh pr create` with **base = the previous branch in the chain** (or `staging` for the first unit) — this is what makes each PR show only its own incremental diff. Follow `.github/pull_request_template.md`. Title in Korean. Assignee: `@me`. Label `refactoring`. Reviewer: the relevant original PR's author. Why: name which of today's PRs this unit cleans up after. What: key design decisions only.
      - Body must open with one line making clear this is an automated architecture-consistency pass, not a critique of any author.
   7. `wt-pool release`. This branch becomes the chain's new tip; continue the loop.
3. Do not attempt to land the chain into `staging` yourself — that is a separate, explicit step the user runs later (see Step 7).

## Step 7 — Report

Summarize in chat:
- Skipped original PRs (number, title, reason).
- Original PRs with no violations found.
- The resulting chain, in order: PR number, branch name, one-line description of what each unit fixed.
- Any unit where CI failed mid-loop (report, do not force through — stop the loop there and still report everything built so far).
- Remind the user that once the chain is reviewed, `chain-merge <PR1> <PR2> ... <PRn>` (in chain order) lands it — `refactor-today` only builds the chain, it does not merge it.

## Constraints

- Only check rules explicitly stated in convention files — same as `check-conventions.md`.
- Never fix in place on a merged commit or force-push over another author's branch.
- Never bypass a failing local CI step to open a PR anyway.
- Never branch a new unit off `staging` once the chain has started — always off the chain's current tip, or the chain re-bases invisibly and `chain-merge` will see a broken commit range.
- Never merge or land the chain — that is always a separate, explicit action.
