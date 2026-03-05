# @nema-io/server

Fastify 5 + tRPC 11 backend.

## Do NOT

- Expose API keys (LLM, embedding, DB) to client. All external calls server-side only.

## Directory Structure

```
src/
├── index.ts              # Fastify bootstrap
├── trpc.ts               # tRPC init + context
├── router.ts             # Root router (sub-router merge only)
│
├── routers/              # tRPC endpoint definitions (thin: validation + service call)
│   ├── session.ts        #   Session CRUD
│   ├── draft.ts          #   Phase 1 — drafting
│   ├── save.ts           #   Phase 2 — save pipeline
│   └── search.ts         #   Pull-out — search + answer
│
├── services/             # Orchestration logic (core)
│   ├── intent.ts         #   Intent Router + Query Planner
│   ├── draft.ts          #   Body refinement + edit cycle
│   ├── save.ts           #   Multi-topic split, similar search, create/update, DB write
│   ├── ingestion.ts      #   Phase 3 batch pipeline (pending loop)
│   └── search.ts         #   3-store parallel search + result merge + answer gen
│
├── infra/                # External service clients
│   ├── supabase.ts       #   Supabase (source of truth)
│   ├── qdrant.ts         #   Qdrant (vector search)
│   ├── neo4j.ts          #   Neo4j (graph traversal)
│   ├── llm.ts            #   LLM client abstraction (provider interface, swappable)
│   └── embedding.ts      #   Voyage AI embedding
│
└── prompts/              # LLM prompt templates (independently tunable)
    ├── intent-router.ts
    ├── draft-refine.ts
    ├── meta-generate.ts
    ├── topic-split.ts
    ├── entity-extract.ts
    └── answer-generate.ts
```

- `routers/` are thin: input validation + service call only. No business logic.
- `services/` own orchestration: LLM call ordering, similar doc search, create/update judgment.
- `infra/` isolates external dependencies. LLM provider swap = change inside `infra/llm.ts`.
- `prompts/` stay separate for independent tuning/review.

## Rules

- `GET /health` MUST always exist (Railway health check).
- MUST use Zod schemas from `@nema-io/shared` for input validation.

## Dev

- `pnpm dev` — tsx watch mode (auto-restart on change).
- `pnpm test` — Vitest. Test files co-located as `*.test.ts`.
