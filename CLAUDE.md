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

## Key Files

- `apps/server/src/trpc.ts` — tRPC instance. Add procedures and middleware here.
- `apps/server/src/router.ts` — Root tRPC router. All API endpoints defined here.
- `apps/server/src/index.ts` — Fastify server entry. Plugins, CORS, tRPC adapter.
- `packages/shared/src/index.ts` — Barrel export for shared types/schemas.

## Testing

- **Framework**: Vitest (Vite-native, ESM-first).
- **Test files**: Co-located with source as `*.test.ts` / `*.test.tsx`.
- **Run**: `pnpm test` (all), `pnpm turbo run test --filter=@nema-io/server` (single package).

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
