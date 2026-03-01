# Nema

AI-powered context management web app. Monorepo with Turborepo + pnpm.

## Commands

```bash
pnpm dev          # Start all apps (web :5173, server :3001)
pnpm build        # Build all packages (topological order)
pnpm typecheck    # Type check all packages
pnpm lint         # ESLint all packages
pnpm test         # Run all tests (Vitest)
```

## Project Structure

```
apps/
  web/            # React + Vite frontend (@nema-io/web)
  server/         # Fastify + tRPC backend (@nema-io/server)
packages/
  shared/         # Shared types + Zod schemas (@nema-io/shared)
  tsconfig/       # Shared TypeScript configs (@nema-io/tsconfig)
```

## Package Relationships

```
@nema-io/web ──depends──> @nema-io/shared ──depends──> @nema-io/tsconfig
@nema-io/server ──depends──> @nema-io/shared ──depends──> @nema-io/tsconfig
```

- `shared` exports raw TypeScript source (not compiled JS). Changes propagate immediately on typecheck.
- tRPC `AppRouter` type is defined in `server/src/router.ts`. Frontend imports it for end-to-end type safety.

## Conventions

- **TypeScript strict mode** everywhere. No `any` unless explicitly justified.
- **ESM only** (`"type": "module"` in all packages).
- **File naming**: kebab-case for files (`user-service.ts`), PascalCase for React components (`UserProfile.tsx`).
- **Imports**: Use `.js` extension in relative imports (TypeScript ESM requirement).
- **Environment variables**: `SERVICE_PROPERTY` pattern (e.g., `SUPABASE_URL`). Frontend vars prefixed with `VITE_`.
- **Formatting**: Prettier (double quotes, semicolons, trailing commas).

## Development Workflow

### Branch Strategy

- `main` = production. Direct push prohibited.
- All work goes through feature branches → PR → review → merge.

**Branch naming**: `<type>/ctx<N>-<N>-<short-description>`

| Type | When |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Config, dependency, infra |
| `refactor` | Code restructuring |

Examples: `feat/ctx2-1-structuring-prompt`, `fix/ctx5-trpc-error-handling`, `chore/update-deps`

### Commit Conventions

- Format: `<type>: <description>`
- Types: `init`, `add`, `update`, `fix`, `refactor`, `chore`, `test`
- Keep commits atomic — one logical change per commit.

### PR Process

1. Create feature branch from `main`.
2. Implement changes. Ensure `pnpm typecheck && pnpm lint && pnpm test` all pass.
3. Create PR using the PR template. Reference the context document that prompted the work.
4. CI runs automatically. PR is not mergeable until CI passes.
5. User reviews and merges.

### PR Sizing

- One PR should be reviewable in a single sitting.
- If a context requires large changes, split into sequential PRs with clear dependency.
- Each PR must leave the codebase in a working state (all checks pass).

## Key Files

- `apps/server/src/trpc.ts` — tRPC instance. Add procedures and middleware here.
- `apps/server/src/router.ts` — Root tRPC router. All API endpoints defined here.
- `apps/server/src/index.ts` — Fastify server entry. Plugins, CORS, tRPC adapter.
- `packages/shared/src/index.ts` — Barrel export for shared types/schemas.

## Testing

- **Framework**: Vitest (Vite-native, ESM-first).
- **Test files**: Co-located with source as `*.test.ts` / `*.test.tsx`.
- **Run**: `pnpm test` (all), `pnpm turbo run test --filter=@nema-io/server` (single package).
- **Before PR**: All tests must pass. Add tests for new logic.

## Self-Update Rules

This file is a living document. Update it as the codebase evolves.

### When to Update

- **New convention established** — naming pattern, error handling approach, state management pattern.
- **Architectural decision made** — new package added, dependency chosen, data flow changed.
- **Gotcha discovered** — library pitfall, environment-specific behavior, non-obvious configuration.
- **Key file added** — new entry point, new router, new shared module.

### When NOT to Update

- One-time workaround (belongs in code comment or PR description).
- Task-specific context (belongs in PR description, not here).
- Unverified pattern (wait until it's used in 2+ places).

### How to Update

- Include CLAUDE.md changes **in the same PR** as the code that established the pattern.
- Add to the relevant existing section. Create a new section only if no existing section fits.
- Keep entries concise — one line per convention, one paragraph per explanation.
- Remove outdated entries rather than marking them deprecated.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 6 |
| Backend | Fastify 5 + tRPC 11 |
| Auth + DB | Supabase (PostgreSQL) |
| Vector DB | Qdrant Cloud |
| Graph DB | Neo4j Aura |
| Embedding | Voyage 4-large |
| LLM | Model-swappable (MVP: GPT-4o) |
| Deploy | Railway |
