# @nema-io/server

Fastify 5 + tRPC 11 backend.

## Do NOT

- Expose API keys (LLM, embedding, DB) to client. All external calls server-side only.

## Directory Structure

```
src/
├── routers/     # tRPC endpoint definitions (thin: validation + service call)
├── services/    # Orchestration logic (core business flows)
├── infra/       # External service clients (Supabase, Qdrant, Neo4j, LLM, Embedding)
├── prompts/     # LLM prompt templates (independently tunable)
└── eval/        # Prompt quality evaluation: seed data, runners, results
```

- `routers/` are thin: input validation + service call only. No business logic.
- `services/` own orchestration: LLM call ordering, similar doc search, create/update judgment.
- `infra/` isolates external dependencies. LLM provider swap = change inside `infra/`.
- `prompts/` stay separate for independent tuning/review.

## Naming

| Scope         | Pattern    | Example              |
| ------------- | ---------- | -------------------- |
| Non-component | kebab-case | `openai-provider.ts` |

## Rules

- `GET /health` MUST always exist (Railway health check).
- MUST use Zod schemas from `@nema-io/shared` for input validation.
- Use `protectedProcedure` for endpoints requiring authentication. Use `publicProcedure` otherwise.

## I18n

- Tolgee (`@tolgee/core`). Locale JSON in `infra/i18n/locales/`. `ko.json` is source of truth.
- Key naming: first segment = domain (e.g. `error.llm_timeout`).
- Locale resolved per-request from `Accept-Language` header. Default: `ko`.
- 빌드 시 staticData 사용. `pnpm tolgee:pull:server`로 Tolgee 플랫폼에서 최신 번역 동기화 가능.

## Dev

- `pnpm dev` — tsx watch mode (auto-restart on change).
- `pnpm test` — Vitest. Test files co-located as `*.test.ts`.
