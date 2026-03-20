# Nema

AI-powered context management web app. Turborepo + pnpm monorepo.

## Workflow

- `staging` = default branch. Feature branch → PR → CI passes → staging merge → Railway staging auto-deploy.
- `main` = production-ready code. `v*` tag push triggers production DB migration + Railway deploy.
- MUST verify CI locally before creating PR.
- PR title: Korean. Assignee: author. Labels: `enhancement`(feature), `bug`(fix), `refactoring`, `documentation`.
- PR body MUST follow `.github/pull_request_template.md` (Why / What / How to verify / Notes).
- Why = the problem this PR solves. What = key design decisions only (no file/function-level change lists — that's what the diff is for).
- No review-feedback changelogs, no file lists, no unchecked checkbox lists.

## DO NOT

- Push directly to `main` or `staging`.
- Add `any` without explicit justification comment.
- Import from compiled `dist/` — always import from `src/`.
- Call external APIs from frontend — all calls go through tRPC. Exception: Supabase Auth client SDK (sign-in, sign-up, session management), Tolgee CDN (translation fetch), PostHog JS SDK (analytics capture).
- Expose server-side keys (LLM, DB) to client.

## Terminology

Product terms vs code terms are mapped in `docs/glossary.md`. Code (variables, files, APIs, URLs) MUST use code terms.

## Conventions

| Rule                                 | Example        |
| ------------------------------------ | -------------- |
| `VITE_` prefix for frontend env vars | `VITE_API_URL` |

- `@nema-io/shared` exports raw TypeScript source. Import from `src/`, not compiled output.
- `AppRouter` type lives in `apps/server/src/router.ts`. Frontend imports for end-to-end type safety.
- Supabase (PostgreSQL + Auth). Schema migrations: `supabase/migrations/`, managed via Supabase CLI.
- Magic numbers MUST be extracted into named constants (e.g., `TICK_INTERVAL_MS = 60_000`). Numeric literals allowed only for 0, 1, and universally obvious values.

## Dev Scripts

| Script             | Usage                      |
| ------------------ | -------------------------- |
| `pnpm dev`         | local full-stack (default) |
| `pnpm dev:web`     | frontend only (staging API)|
| `pnpm dev:server`  | server only                |
| `pnpm dev:prod`    | local full-stack (prod API)|

## Tests

- MUST test only real user scenarios and edge cases that need pre-validation.
- MUST NOT test runtime/framework-guaranteed behavior (e.g., `Date.toISOString()` format).
- MUST NOT write tests solely for coverage — every test MUST justify a concrete failure it prevents.

## Comments

- MUST NOT add comments that restate what code already expresses (type casts, function names, obvious flow).
- Comments are reserved for: TODO, and intent/context that code alone cannot convey.
- PR title, description, and code comments in Korean. CLAUDE.md in English.
- Developer-facing error messages (throw, assert, lint rules) in English.

## Self-Update

DO NOT add: one-time workarounds, task-specific context, unverified patterns.
DO NOT add: file paths or structure descriptions discoverable from code.
DO NOT add: rules already enforced by tooling (lint, formatter, CI).
Keep under 60 lines. Move package-specific rules to that package's CLAUDE.md.
