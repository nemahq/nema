# @nema-io/server

Fastify 5 + tRPC 11 backend.

## Do NOT

- Expose API keys (LLM, embedding, DB) to client. All external calls server-side only.

## Rules

- `GET /health` MUST always exist (Railway health check).
- MUST use Zod schemas from `@nema-io/shared` for input validation.

## Dev

- `pnpm dev` — tsx watch mode (auto-restart on change).
- `pnpm test` — Vitest. Test files co-located as `*.test.ts`.
