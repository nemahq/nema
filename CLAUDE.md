# Nema

AI-powered context management web app. Turborepo + pnpm monorepo.

## Workflow

- `main` = latest integrated code. Feature branch → PR → CI passes → merge.
- Deploy: ONLY version tags (`v*`) trigger Railway deployment.
- Branch: `<type>/ctx<N>-<N>-<short-description>` (feat, fix, chore, refactor)
- MUST verify CI locally before creating PR.
- MUST reference context document in PR description.
- PR title: Korean. Assignee: author. Labels: `enhancement`(feature), `bug`(fix), `refactoring`, `documentation`.

## DO NOT

- Push directly to `main`.
- Add `any` without explicit justification comment.
- Import from compiled `dist/` — always import from `src/`.
- Call external APIs from frontend — all calls go through tRPC. Exception: Supabase Auth client SDK (sign-in, sign-up, session management).
- Expose server-side keys (LLM, DB) to client.

## Conventions

| Rule                                 | Example        |
| ------------------------------------ | -------------- |
| `VITE_` prefix for frontend env vars | `VITE_API_URL` |

- `@nema-io/shared` exports raw TypeScript source. Import from `src/`, not compiled output.
- `AppRouter` type lives in `apps/server/src/router.ts`. Frontend imports for end-to-end type safety.
- Supabase (PostgreSQL + Auth). Schema migrations: `supabase/migrations/`, managed via Supabase CLI.
- UI work MUST follow the design system guidelines in `docs/design/design-system.html`.

## Tests

- MUST test only real user scenarios and edge cases that need pre-validation.
- MUST NOT test runtime/framework-guaranteed behavior (e.g., `Date.toISOString()` format).
- MUST NOT write tests solely for coverage — every test MUST justify a concrete failure it prevents.

## Comments

- MUST NOT add comments that restate what code already expresses (type casts, function names, obvious flow).
- Comments are reserved for: TODO, and intent/context that code alone cannot convey.
- PR title, description, and code comments in Korean. CLAUDE.md in English.

## Self-Update

DO NOT add: one-time workarounds, task-specific context, unverified patterns.
DO NOT add: file paths or structure descriptions discoverable from code.
DO NOT add: rules already enforced by tooling (lint, formatter, CI).
Keep under 60 lines. Move package-specific rules to that package's CLAUDE.md.
