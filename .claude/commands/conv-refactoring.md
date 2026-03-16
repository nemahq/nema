# Convention Check

Verify changed code against project conventions. Fix violations in place.

## Step 1 — Collect changes

1. Run `git diff HEAD` (unstaged + staged) to get changed files and diffs.
   - No changes → report "No changes to check" and stop.
2. Classify each changed file:
   - **New file**: needs full validation (naming, folder placement, structure).
   - **Existing file**: validate changed code only.
3. Note the file types touched (`.ts`, `.tsx`, `.css`, etc.) to filter irrelevant rules later.

## Step 2 — Determine scope

Identify affected packages from file paths:
- `apps/web/` → web
- `apps/server/` → server
- Other (`packages/`, root config) → that package's CLAUDE.md only

## Step 3 — Load conventions

Read convention files for each affected package:
- web: `apps/web/docs/conventions.md` + `apps/web/CLAUDE.md`
- server: `apps/server/docs/conventions.md` + `apps/server/CLAUDE.md`
- Root `CLAUDE.md` is already in context — do not re-read.

## Step 4 — Build checklist

From the loaded convention files, extract every **section heading** as a checklist category.
Example for web conventions:
- [ ] Components
- [ ] Hooks
- [ ] Functions
- [ ] Naming
- [ ] Data Fetching
- [ ] React
- [ ] TypeScript
- [ ] ...

Skip sections entirely irrelevant to the changed file types (e.g., skip "Responsive" if no `.tsx` changed).

## Step 5 — Check and fix

For each checklist item:
1. Read all rules under that section.
2. For each rule, check against the diff. If the diff alone is insufficient to judge (e.g., "one component per file", "constants outside component"), read the full file.
3. If a violation is found → **fix it immediately**, then record what was fixed.
4. Mark the checklist item as done before moving to the next section.

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
