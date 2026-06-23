# Doc Writing Review

Refine internal docs against the doc writing guide.

## Step 1 — Identify target

1. If a path is given in arguments, use it.
2. Otherwise run `git diff main...HEAD` + `git diff HEAD` to find changed docs under `docs/`.
3. Keep only what the guide governs (judge by genre, not path):
   - 서사형 산문 (설명·주장하는 글) → full check.
   - 표·체크리스트 위주 레퍼런스 → 명료성만.
   - 사용자향 출력(`ux-writing.md` 관할), 비산문(html·코드·다이어그램) → skip.
4. Nothing to review → output "No docs to review." and stop.

## Step 2 — Load rules

Read `docs/guides/doc-writing.md` in full. Apply only what it says. Never hardcode its rules here — if the guide changes, this skill follows it.

## Step 3 — Check

For each target, run the guide's 체크리스트.
- 산문: 명료성 + 문체 both.
- 레퍼런스(표): 명료성만.

## Step 4 — Apply

Follow the mode label the guide gives each checklist group:
- **명료성 `[고침]`**: edit the file immediately upon discovery, then report what changed. Do not just propose.
- **문체 `[짚기]`**: do not edit. Point out where and why, and let the writer decide.
- **뜻 보존 (process constraint)**: never change meaning. If a fix would alter what the sentence says, flag it instead of editing.

## Step 5 — Report

| Status | Output |
|--------|--------|
| 깨끗함 | `Doc writing check passed.` |
| 있음 | print the sections below |

```
### 고침 (명료성)

| File | 위치 | 고친 내용 |
|------|------|-----------|
| ...  | ...  | ...       |

### 짚음 (문체)

| File | 위치 | 무엇이 걸리나 |
|------|------|---------------|
| ...  | ...  | ...           |
```

## Constraints

- Apply only rules from `docs/guides/doc-writing.md`. Do not flag on personal preference or general best practices.
- Never hardcode rules in this file — read them from the guide each run.
- 뜻 보존 first: a fix that changes meaning is not a fix.
