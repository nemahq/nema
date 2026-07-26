# Nema

AI-powered context management web app. Turborepo + pnpm monorepo.

## Workflow

- `staging` = default branch (feature branch → PR → CI → staging merge → Railway staging auto-deploy). `main` = production-ready code (`v*` tag push → prod DB migration + Railway deploy). Merge method: a normal branch (single slice of work, even with multiple commits from review fixes) → `staging` is squash. A shared feature branch that already has multiple squash-merged sub-PRs stacked on it → `staging` is merge commit (preserves per-PR history). `staging` → `main` is always merge commit.
- Tag format: CalVer `vYYYY.MM.DD` (`.N` suffix for same-day redeploys). Every prod deploy MUST be tagged — migration diff is computed against the previous tag.
- MUST verify CI locally before creating PR.
- PR title: Korean. Assignee: author. Labels: `enhancement`/`bug`/`refactoring`/`documentation`.
- PR body MUST follow `.github/pull_request_template.md` (Why / What / How to verify / Notes). Why = problem solved. What = key design decisions only, no file/function-level change lists. No review-feedback changelogs, file lists, or unchecked checkboxes.

## DO NOT

- Push directly to `main` or `staging`.
- Add `any` without explicit justification comment.
- Import from compiled `dist/` — always import from `src/`.
- Call external APIs from frontend — all calls go through tRPC. Exception: Supabase Auth client SDK (sign-in, sign-up, session management), Tolgee CDN (translation fetch), PostHog JS SDK (analytics capture).
- Expose server-side keys (LLM, DB) to client.
- Duplicate an env var across repo and Railway. One home per var: mode-agnostic public config → repo `.env`, mode-specific public config → repo `.env.{mode}`, secrets → Railway only.

## Terminology

Product terms vs code terms are mapped in `docs/guides/glossary.md`. Code (variables, files, APIs, URLs) MUST use code terms.

## Conventions

- MUST follow universal code rules in `docs/guides/conventions.md`. Package-specific rules live in each package's `docs/conventions.md`.
- `@nema-io/shared` exports raw TypeScript source — import from `src/`, not compiled output. `AppRouter` type lives in `apps/server/src/router.ts` for frontend end-to-end type safety.
- Supabase (PostgreSQL + Auth). Schema migrations: `supabase/migrations/`, managed via Supabase CLI.
- Magic numbers MUST be extracted into named constants (e.g., `TICK_INTERVAL_MS = 60_000`). Numeric literals allowed only for 0, 1, and universally obvious values.
- `VITE_` prefix for frontend env vars (e.g., `VITE_API_URL`).

## Dev Scripts

| Script              | Usage                              |
| ------------------- | ----------------------------------- |
| `pnpm dev`          | local full-stack (default)          |
| `pnpm dev:local`    | local full-stack (local Supabase)   |
| `pnpm dev:web`      | frontend only (staging API)         |
| `pnpm dev:web:prod` | frontend only (prod API)            |
| `pnpm dev:server`   | server only                         |

Local server secrets live in `~/.config/nema/.env.secret` (auto-loaded, git-ignored).

## Tests

- MUST test only real user scenarios and edge cases that need pre-validation.
- MUST NOT test runtime/framework-guaranteed behavior (e.g., `Date.toISOString()` format).
- MUST NOT write tests solely for coverage — every test MUST justify a concrete failure it prevents.

## Comments

- MUST NOT add comments that restate what code already expresses (type casts, function names, obvious flow). Reserved for TODO and intent/context code alone can't convey.
- PR title, description, and code comments in Korean. CLAUDE.md in English. Developer-facing error messages (throw, assert, lint rules) in English.

## Self-Update

DO NOT add: one-time workarounds, task-specific context, unverified patterns, file paths/structure discoverable from code, rules already enforced by tooling (lint, formatter, CI).
Keep under 60 lines. Move package-specific rules to that package's CLAUDE.md.
