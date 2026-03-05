# @nema-io/server

Fastify 5 + tRPC 11 backend.

## Do NOT

- Expose API keys (LLM, embedding, DB) to client. All external calls server-side only.

## Entry Points

- `src/index.ts` — Server bootstrap. Fastify plugins, CORS, tRPC adapter mount at `/trpc`.
- `src/trpc.ts` — tRPC init. `router` and `publicProcedure` exported here.
- `src/router.ts` — Root router. Add new routers via `t.mergeRouters` or nested routes.

## Rules

- `GET /health` MUST always exist (Railway health check).
- MUST use Zod schemas from `@nema-io/shared` for input validation.

## Infrastructure Modules

- `src/env.ts` — `requireEnv()` utility for env var validation.
- `src/infra/embedding/` — Embedding provider abstraction + Voyage implementation.
  - `embedding-provider.ts` — `EmbeddingProvider` interface, `EmbeddingError`.
  - `voyage-provider.ts` — `createVoyageProvider()` factory. SDK: `voyageai`.
- `src/infra/vector/` — Vector storage abstraction + Qdrant implementation.
  - `vector-store.ts` — `VectorStore` interface, `DocumentPayload`, `VectorStoreError`.
  - `qdrant-store.ts` — `createQdrantStore()` factory. Collection: `"documents"`, 1024-dim Cosine.
  - Payload includes `doc_id`, `tags`, `summary`, `embedding_model` (`"<providerId>/<model>"`).

## Dev

- `pnpm dev` — tsx watch mode (auto-restart on change).
- `pnpm test` — Vitest. Test files co-located as `*.test.ts`.
