# Nema

AI-powered context management web app. Turborepo + pnpm monorepo.

## Workflow

- `main` = latest integrated code. All work: feature branch → PR → CI passes → merge.
- Deploy: ONLY version tags (`v*`) trigger Railway deployment.
- Branch naming: `<type>/ctx<N>-<N>-<short-description>` (feat, fix, chore, refactor)
- MUST verify all CI checks pass locally before creating PR.
- MUST reference the context document in PR description.

## Do NOT

- Push directly to `main`.
- Add `any` without explicit justification comment.
- Import from compiled `dist/` — always import from `src/`.
- Call external APIs from frontend — all calls go through tRPC.
- Expose server-side keys (LLM, DB) to client.

## Conventions

| Rule                                      | Example                          |
| ----------------------------------------- | -------------------------------- |
| `.js` extension in relative imports (ESM) | `import { foo } from "./bar.js"` |
| `VITE_` prefix for frontend env vars      | `VITE_API_URL`                   |
| Component files: PascalCase               | `UserProfile.tsx`                |
| Non-component files: kebab-case           | `use-auth.ts`                    |

- `@nema-io/shared` exports raw TypeScript source. Import from `src/`, not compiled output.
- `AppRouter` type lives in `apps/server/src/router.ts`. Frontend imports for end-to-end type safety.

## Key Files

- `apps/server/src/index.ts` — Fastify entry. Plugins, CORS, tRPC adapter.
- `apps/server/src/router.ts` — Root tRPC router. All API endpoints.
- `apps/server/src/trpc.ts` — tRPC instance. Procedures and middleware.
- `packages/shared/src/index.ts` — Barrel export for shared types/schemas.

## Self-Update

This file is a living document. Update it in the same PR when:

- New convention is established (used in 2+ places).
- Architectural decision is made (new package, dependency, data flow).
- Non-obvious gotcha is discovered.

Do NOT add: one-time workarounds, task-specific context, unverified patterns.
Keep it under 60 lines. Move package-specific rules to that package's CLAUDE.md.
