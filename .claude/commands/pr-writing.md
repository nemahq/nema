# PR Writing

Analyze the current branch and compose a high-quality PR — title, body, label. When run standalone, also handles reviewer selection and PR creation. When called from `/create-pr`, only Steps 1-6 are executed (the orchestrator handles the rest).

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
   - If the user declines → continue in **large PR mode** (Step 6 will add a TL;DR).

## Step 2 — Determine Why

1. Check the current conversation context for the motivation behind the changes (issue links, user statements, prior discussion).
2. If sufficient context exists → draft the "Why" section directly (1-2 sentences max).
3. If context is unclear or absent → ask the user:

   > 이 변경이 필요한 이유가 뭔가요? (관련 이슈/티켓이 있다면 함께 알려주세요)

   Wait for the answer, then draft the section.

## Step 3 — Draft What

1. From the diff and commit history, identify the key design decisions.
2. Draft the "What" section (2-5 lines max). Do NOT repeat what the diff already shows — design decisions only, no file/function change lists.

## Step 4 — Draft How to verify

1. Ask the user:

   > 리뷰어가 확인할 수 있는 구체적인 시나리오가 있나요?

   - If yes → use their input to draft verification steps.
   - If no → infer from the diff (which flows are affected) and draft concrete steps.
2. Format as specific runnable scenarios, not generic checklist items like "타입체크 통과 확인".

## Step 5 — Notes

Ask the user:

> 트레이드오프, 리스크, 후속 작업 등 남길 노트가 있나요?

- If yes → include in Notes section.
- If no → omit the section entirely.

## Step 6 — Compose PR body

1. **Checklist**: Check `CLAUDE.md updated` automatically based on the diff:
   - If any CLAUDE.md file was changed → mark as `[x]`.
   - Otherwise → leave as `[ ]`.
2. **Title**: Korean, purpose-oriented, under 70 characters. No English prefixes like `feat:`, `fix:`, `chore:`.
3. **Label**: Recommend one of `enhancement`, `bug`, `refactoring`, `documentation` based on the nature of the changes.
4. Assemble the body following `.github/pull_request_template.md` format:

```markdown
## Why

{from Step 2 — 1-2 sentences}

## What

{from Step 3 — 2-5 lines, design decisions only}

## How to verify

{from Step 4 — concrete runnable scenarios}

## Notes

{from Step 5, or omit section entirely}

## Checklist

- [x/- ] CLAUDE.md updated (if new convention or architecture change)
```

### Length rules

| Section       | Target             |
| ------------- | ------------------ |
| Why           | 1-2 sentences      |
| What          | 2-5 lines          |
| How to verify | 2-4 scenarios      |
| Notes         | 1-2 items, or omit |

### Large PR mode (400+ lines)

If the user opted to keep a large PR, prepend:

```markdown
## TL;DR

{1-2 sentence summary of the entire change}
```

**When called from `/create-pr`, STOP here.** Steps 7-8 below are for standalone execution only.

---

## Step 7 — Create PR (standalone only)

1. Push the branch: `git push -u origin HEAD`.
2. Create the PR with full metadata:

   ```
   gh pr create \
     --title "<title>" \
     --label "<label>" \
     --assignee "@me" \
     --body "<body>"
   ```

3. Report the PR URL.

## Constraints

- Do NOT include content that the diff already shows. Why and What explain motivation and decisions, not line-by-line changes.
- When conversation context provides sufficient motivation, draft Why directly without asking. Only ask when context is unclear or absent.
- Do NOT ask for confirmation before creating the PR. Generate and create in one flow.
- CLAUDE.md checklist item is checked automatically based on diff; do not ask the user.
