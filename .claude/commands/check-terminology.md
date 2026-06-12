# Terminology Check

Verify changed code uses correct terminology from `docs/guides/glossary.md`. Fix violations in place.

## Step 1 — Collect changes

1. Run `git diff staging...HEAD` to get all changes on the current branch.
   - Also include uncommitted changes: `git diff HEAD` (unstaged + staged).
   - Combine both to get the full picture of current work.
   - No changes in either → report "No terminology changes to check" and stop.
2. From the diff, identify:
   - **Code files** (`.ts`, `.tsx`): variable names, type names, file names, import paths
   - **Doc files** (`.md`): references to code-level terms
   - **Glossary itself** (`docs/guides/glossary.md`): structural consistency

## Step 2 — Load glossary

Read `docs/guides/glossary.md` in full. Build a lookup of:

- 제품 용어 (한/영) — used in user-facing text
- 코드 용어 — used in code (variables, files, APIs, URLs)

## Step 3 — Check code terms

For each changed code file (`.ts`, `.tsx`):

- [ ] **Identifiers use code terms, not product terms.** Scan variable names, type names, interface names, function names, enum keys. Flag if a product term appears where the code term should be used (e.g., `맥락` in a variable name instead of `session`, `기억` instead of `memory`).
- [ ] **File and folder names use code terms.** Check new/renamed files against glossary.
- [ ] **Import paths use code terms.** No product terms in path segments.

## Step 4 — Check glossary consistency

If `docs/guides/glossary.md` itself was changed:

- [ ] **No duplicate code terms.** Each code term maps to exactly one product term.
- [ ] **No empty cells.** Every row has all columns filled (use `—` for intentionally empty).

## Step 5 — Fix

Fix violations immediately upon discovery.

## Step 6 — Report

| Status           | Output                      |
| ---------------- | --------------------------- |
| No violations    | `Terminology check passed.` |
| Violations fixed | Print summary table         |

```markdown
### Fixed

| File | What was fixed |
| ---- | -------------- |
| ...  | ...            |
```

## Constraints

- Only check terms explicitly listed in `docs/guides/glossary.md`. Do not flag terms that are not in the glossary.
- Complete every checklist item. Do not skip or batch.
