# Create PR

Orchestrator that runs quality gates, composes a PR, and submits it. Quality gates are delegated to parallel subagents (via the Agent tool) so their stop points don't propagate to the main flow. PR composition is inlined because it requires user interaction.

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
   - If the user declines → continue in **large PR mode** (used in Step 4).

## Step 2 — Quality gates (parallel subagents)

Launch the following three subagents in a **single message** (parallel Agent tool calls). Each subagent **only inspects and reports** — it does NOT edit files. The orchestrator applies fixes in Step 3.

For each subagent, use `subagent_type: general-purpose` and brief it with the full instructions of the corresponding skill, plus an explicit override:

> Do NOT edit any files. Return a structured violation report only. If no violations, return exactly `PASS`.

Subagents to launch:

1. **convention-check** — run the logic of `.claude/commands/check-conventions.md` (Steps 1–5b) against the current branch's diff. Return a table of `{file, line, rule, suggested fix}` per violation.
2. **terminology-check** — run the logic of `.claude/commands/check-terminology.md` (Steps 1–4) against the current branch's diff. Return a table of `{file, identifier, glossary rule, suggested fix}` per violation.
3. **ux-writing-check** — run the logic of `.claude/commands/check-ux-writing.md` (Steps 1–3) against the current branch's diff. Return a table of `{file, key, rule, suggested fix}` per violation.

Each agent must cap its report at roughly 300 words — full fix code is the orchestrator's job.

## Step 3 — Apply fixes in batch

1. Collect the three reports.
2. All three returned `PASS` → skip to Step 4.
3. Any violations → apply fixes directly (Edit/Write tool), grouped by file to minimize churn. After fixes, run `pnpm typecheck` if any `.ts` / `.tsx` file was modified.
4. Commit the fixes as a single commit: `리뷰 반영 — 컨벤션/용어/UX 자동 수정` (adjust scope names to match which gates actually flagged issues).

## Step 4 — Compose PR (inline, no questions)

Execute this step inline. Do NOT ask the user anything — infer every section from the conversation context, diff, and commit history. If a section genuinely has nothing to say, omit it (Notes) or fall back to the default (see below). The user can correct the draft after it's posted.

1. **Why** (1–2 sentences). Infer from conversation context (issue links, prior discussion, stated motivation) and commit messages. Must be self-contained for a 6-month-later reader.
2. **What** (2–5 lines). Design decisions only — no file/function change lists. Infer from diff + commit history.
3. **How to verify**. Infer concrete runnable scenarios from the affected flows. Do NOT write generic items like "타입체크 통과 확인". If the change is a pure doc/config edit with no runtime behavior, write a single concrete manual-review scenario (e.g., "다음 실행 시 X 동작이 Y 방식으로 바뀌는지").
4. **Notes**. Include only if the diff or conversation surfaces a real tradeoff, risk, or follow-up. Otherwise omit the section entirely.
5. **Title** (Korean, under 70 chars). Format: `{한글 요약}` or `{한글 요약} — {부제}`. No `feat:`/`fix:`/`chore:` prefixes.
6. **Label**. One of `enhancement`, `bug`, `refactoring`, `documentation`.
7. **Checklist**. Auto-check `CLAUDE.md updated` if any `CLAUDE.md` file is in the diff.
8. **Large PR mode**: if Step 1 flagged 400+ lines and the user opted to keep it, prepend a `## TL;DR` section (1–2 sentences).
9. Assemble the body per `.github/pull_request_template.md`:
   ```markdown
   ## Why
   ## What
   ## How to verify
   ## Notes        (omit if empty)
   ## Checklist
   - [x/ ] CLAUDE.md updated (if new convention or architecture change)
   ```

## Step 5 — Push and create

1. `git push -u origin HEAD`.
2. Create the PR:
   ```
   gh pr create \
     --title "<title>" \
     --label "<label>" \
     --assignee "@me" \
     --body "<body>"
   ```
3. Report the PR URL.

## Constraints

- Quality-gate subagents MUST NOT edit files. Reporting only — the orchestrator owns all writes (keeps fix authority in one place, consistent with batch-fixes principle).
- Do NOT run the quality-gate sub-skills via the `Skill` tool. Use `Agent` so their stop points don't end the main turn.
- Do NOT skip Step 2. Gates run before PR composition.
- Do NOT ask for confirmation before creating the PR in Step 5. Generate and create in one flow.
