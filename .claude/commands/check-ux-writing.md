# UX Writing Review

Review and fix translation keys against the UX writing guide.

## Step 1 — Identify changes

1. Run `git diff main...HEAD` + `git diff HEAD` to find translation key changes:
   - `apps/web/src/lib/tolgee/*.json`
   - `apps/server/src/infra/i18n/locales/*.json`
   - Hardcoded user-facing text in `.tsx` files
2. No changes found → output "No translation key changes to review." and stop.

## Step 2 — Load rules

Read the following files:
- `docs/ux-writing.md` (full guide)
- `docs/glossary.md` (terminology)
- Changed translation JSON files in full (for context)

## Step 3 — Run checklist

For each changed key, check the following in order.

### Korean (ko.json)

- [ ] 해요체 (no 합쇼체 mixing like "~습니다")
- [ ] Buttons: natural phrasing (~하기 or noun, whichever fits)
- [ ] Period: sentence → yes, label → no
- [ ] Spacing: dependent nouns like "중" properly spaced
- [ ] Terminology: glossary terms used, no synonym conflicts (e.g. "중지" not "중단", "맥락" not "세션")

### English (en.json)

- [ ] Sentence case (only product feature names and proper nouns capitalized)
- [ ] Active voice, prefer 2nd person
- [ ] Plain language (no technical jargon)
- [ ] Period: sentence → yes, label → no

### Shared

- [ ] ko/en pair both exist
- [ ] Onboarding copy avoids product feature terms (new users don't know them)
- [ ] Error messages follow cause + resolution structure
- [ ] No hardcoded user-facing text (must use t() keys)

## Step 4 — Fix

Fix violations immediately upon discovery.

## Step 5 — Report

| Status | Output |
|--------|--------|
| No violations | `UX writing check passed.` |
| Violations fixed | Print summary table |

```
### Fixed

| File | Key | What was fixed |
|------|-----|----------------|
| ...  | ... | ...            |
```

## Constraints

- Only apply rules from `docs/ux-writing.md` and `docs/glossary.md`. Do not flag based on personal preference or general best practices.
- Complete every checklist item. Do not skip or batch.
