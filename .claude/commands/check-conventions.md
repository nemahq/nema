# Convention Refactoring

Verify changed code against project conventions. Fix violations in place.

## Step 1 — Collect changes

1. Determine the base branch (`main`) and run `git diff main...HEAD` to get all changes on the current branch.
   - Also include uncommitted changes: `git diff HEAD` (unstaged + staged).
   - Combine both to get the full picture of current work.
   - No changes in either → report "No changes to check" and stop.
2. Classify each changed file:
   - **New file**: needs full validation (naming, folder placement, structure).
   - **Existing file**: validate changed code only.
3. Note the file types touched (`.ts`, `.tsx`, `.css`, etc.) to filter irrelevant rules later.

## Step 2 — Determine scope

Identify affected packages from file paths:
- `apps/web/` → web
- `apps/server/` → server
- `packages/weave/` → weave
- Other (`packages/`, root config) → that package's CLAUDE.md only

## Step 3 — Load conventions

Read **all** applicable convention sources for each affected package:
- web: `apps/web/docs/conventions.md` + `apps/web/CLAUDE.md`
- server: `apps/server/docs/conventions.md` + `apps/server/CLAUDE.md`
- weave: `docs/guides/weave-usage.md`
- Any `.tsx` change under `apps/web/` also loads `docs/guides/weave-usage.md` — it governs when to reach for a weave component vs. raw DOM, not just weave's own source.
- Root `CLAUDE.md` is already in context — do not re-read, but DO include its rules in the checklist.

## Step 4 — Build checklist

From **all loaded convention sources** (conventions.md + CLAUDE.md files including root), extract every **section heading** as a checklist category.

Example for web changes:
- [ ] Root CLAUDE.md — DO NOT
- [ ] Root CLAUDE.md — Conventions
- [ ] Root CLAUDE.md — Comments
- [ ] Web CLAUDE.md — Do NOT
- [ ] Web CLAUDE.md — I18n / Storage
- [ ] Web conventions — Components
- [ ] Web conventions — Hooks
- [ ] Web conventions — Functions
- [ ] Web conventions — Naming
- [ ] Web conventions — Data Fetching
- [ ] Web conventions — React
- [ ] Web conventions — TypeScript
- [ ] ...

Skip sections entirely irrelevant to the changed file types (e.g., skip "Responsive" if no `.tsx` changed).

## Step 5 — Check and fix

For each checklist item:
1. Read all rules under that section.
2. For each rule, check against the diff. If the diff alone is insufficient to judge (e.g., "one component per file", "constants outside component"), read the full file.
3. If a violation is found → **fix it immediately**, then record what was fixed.
4. Mark the checklist item as done before moving to the next section.

## Step 5b — Architecture check

If the loaded conventions include an Architecture section, verify layer boundaries and data ownership rules against the diff:
- **web**: Check that components own their data via hooks rather than receiving it as props from parents. For each data prop, trace the parent usage — if the parent fetches via a hook and the child could call the same hook directly, the child should own the call.
- **server**: Check that routers stay thin (validation + service call only), services call infra directly (routers do not fetch and pass data into services), and infra is not bypassed with raw SDK calls.

## Step 6 — Report

After all sections are checked:
- No violations found → output: `Convention check passed.`
- Violations fixed → output a summary table:

```
### Fixed

| File | What was fixed |
|------|----------------|
| ...  | ...            |
```

## Constraints

- Only check rules explicitly stated in convention files. Do not flag based on personal preference or general best practices.
- Complete every checklist item. Do not skip or batch sections.
