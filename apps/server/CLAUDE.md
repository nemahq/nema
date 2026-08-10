# @nema-io/server

Fastify 5 + tRPC 11 backend.

## Do NOT

- Expose API keys (LLM, DB) to client. All external calls server-side only.

## Directory Structure

```
src/
├── routers/     # tRPC endpoint definitions (thin: validation + service call)
├── services/    # Orchestration logic (core business flows)
├── infra/       # External service clients (Supabase, LLM)
└── prompts/     # LLM prompt templates (independently tunable)
```

- `routers/` are thin: input validation + service call only. No business logic.
- `services/` own orchestration: LLM call ordering, DB read/write sequencing.
- `infra/` isolates external dependencies. LLM provider swap = change inside `infra/`.
- `prompts/` stay separate for independent tuning/review.

## Naming

| Scope         | Pattern    | Example              |
| -------------- | ---------- | --------------------- |
| Non-component  | kebab-case | `source-router.ts`   |

## Rules

- `GET /health` MUST always exist (Railway health check).
- MUST use Zod schemas from `@nema-io/shared` for input validation.
- Use `publicProcedure` for unauthenticated endpoints, `protectedProcedure` for auth-required ones.

## Dev

- `pnpm dev` — tsx watch mode (auto-restart on change).
- `pnpm test` — Vitest. Test files co-located as `*.test.ts`; `*.integration.test.ts` files need a local Supabase (`supabase start`) and are skipped gracefully otherwise.
