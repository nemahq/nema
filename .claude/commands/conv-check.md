# Convention Check

Verify that changed code follows project conventions.

## Procedure

1. Run `git diff HEAD` (unstaged + staged) to get the list of changed files and their diffs.
   - If no changes exist, report "No changes to check" and stop.

2. Determine affected packages from changed file paths:
   - `apps/web/` → web
   - `apps/server/` → server
   - Other (packages/, root config, etc.) → refer to that package's CLAUDE.md only

3. Read convention files for each affected package:
   - web: `apps/web/docs/conventions.md` + `apps/web/CLAUDE.md`
   - server: `apps/server/docs/conventions.md` + `apps/server/CLAUDE.md`
   - Root `CLAUDE.md` is already in context — do not re-read.

4. Check each rule in the loaded conventions against the diff:
   - Go rule by rule, in order. Do not scan everything at once.
   - Skip rules that are irrelevant to the changed code.
   - For each violation, record the file:line, violated rule, and suggested fix.

5. Report results:
   - No violations → output a single line: "Convention check passed."
   - Violations found → output in this format:

```
### Convention Violations

| File:Line | Rule | Suggested Fix |
|-----------|------|---------------|
| ... | ... | ... |
```

## Constraints

- Report violations only. Do not mention rules that are followed correctly.
- Only check rules explicitly stated in convention files. Do not flag based on personal preference or general best practices.
- Do not auto-fix. Report only.
