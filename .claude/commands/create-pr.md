# Create PR

Orchestrator that runs quality gates, composes a PR, and submits it. Each step delegates to a sub-skill or is self-contained. This is the full post-development pipeline before a PR goes out for review.

## Step 1 — Collect changes

1. Detect the base branch:
   - If a PR already exists for the current branch: `gh pr view --json baseRefName --jq '.baseRefName'`.
   - Otherwise: fall back to `staging`.
2. Run `git diff {base}...HEAD` and `git log --oneline {base}..HEAD` to get the full picture of the branch.
   - Also include uncommitted changes: `git diff HEAD`.
   - No changes in either → report "No changes to create a PR for" and stop.
3. Count changed lines (excluding test files): `git diff {base}...HEAD --stat -- . ':!**/*.test.*' ':!**/*.spec.*'`.
4. If the count exceeds **400 lines**:
   - Warn the user and suggest splitting.
   - If the user agrees → propose split boundaries and stop.
   - If the user declines → continue in **large PR mode** (passed to `/pr-writing`).

## Step 2 — Quality gates

Run sequentially. If any gate fixes violations, commit the fixes before proceeding.

1. Execute `/check-conventions`.
2. Execute `/check-terminology`.
3. Execute `/check-ux-writing`.

## Step 3 — Write PR

Execute `/pr-writing` **Steps 1-6 only** (collect changes, determine Why, draft What, draft How to verify, Notes, compose body). The orchestrator handles reviewer selection and PR creation in Step 4.

## Step 4 — Create PR

1. Ask the user:

   > 리뷰어를 추가할까요? (GitHub 사용자명, 없으면 Enter)

2. Ask the user if the PR should be created as draft:

   > Draft로 생성할까요? (y/N)

3. Push the branch: `git push -u origin HEAD`.
4. Create the PR with full metadata:

   ```
   gh pr create \
     --title "<title from /pr-writing>" \
     --label "<label from /pr-writing>" \
     --assignee "@me" \
     --body "<body from /pr-writing>" \
     [--reviewer "<reviewer1>,<reviewer2>"] \
     [--draft]
   ```

5. Report the PR URL.

## Constraints

- This skill is an orchestrator. Do NOT duplicate logic that belongs in sub-skills.
- Do NOT skip quality gates (Step 2). They must run before PR composition.
- Do NOT ask for confirmation before creating the PR. Generate and create in one flow.
