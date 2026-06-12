import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { VectorStore } from "@server/infra/vector";

import type { PendingSource, PendingStatement } from "./types";
import { createStatementSyncWorker, POLL_INTERVAL_MS } from "./worker";

const SOURCE_ID = "a0000000-0000-4000-a000-000000000001";
const SPACE_ID = "b0000000-0000-4000-a000-000000000001";
const STMT_ID_1 = "c0000000-0000-4000-a000-000000000001";
const STMT_ID_2 = "c0000000-0000-4000-a000-000000000002";

const PENDING_SOURCE: PendingSource = {
  id: SOURCE_ID,
  space_id: SPACE_ID,
  author_id: null,
  session_id: null,
  body: "테스트 원문",
  created_at: "2026-06-11T00:00:00.000Z",
};

function pendingStatement(
  overrides: Partial<PendingStatement>,
): PendingStatement {
  return {
    id: STMT_ID_1,
    space_id: SPACE_ID,
    content: "테스트 진술",
    type: "claim",
    confidence: "certain",
    status: "active",
    created_at: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

// rpc 이름별 응답 큐 — shift해서 반환하고, 비면 fallback
function mockSupabase(queues: Record<string, unknown[]>) {
  const fallback: Record<string, unknown> = {
    read_sync_events: [],
    fetch_pending_sources: [],
    fetch_pending_statements: [],
  };
  const rpc = vi.fn(async (name: string) => {
    const queue = queues[name];
    if (queue && queue.length > 0) {
      return { data: queue.shift(), error: null };
    }
    return { data: fallback[name] ?? null, error: null };
  });
  return { client: { rpc } as unknown as TypedSupabaseClient, rpc };
}

function mockLlm(statements: unknown[]): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({ statements }),
    async *generateStream() {
      yield "";
    },
    generateText: vi.fn().mockResolvedValue(""),
  };
}

function mockEmbedding(): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension: 2,
    embed: vi.fn(),
  };
}

function mockVectorStore(): VectorStore {
  return {
    ensureCollection: vi.fn(),
    upsertStatements: vi.fn().mockResolvedValue(undefined),
    deleteStatements: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
  };
}

const NOTIFY_ROW = { msg_id: 1, read_ct: 1, message: { type: "notify" } };

function rpcCalls(rpc: ReturnType<typeof vi.fn>, name: string) {
  return rpc.mock.calls.filter(([n]) => n === name);
}

async function runOnePoll(deps: {
  supabase: TypedSupabaseClient;
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
}) {
  const worker = createStatementSyncWorker(deps);
  worker.start(); // start가 즉시 sweep 1회 실행
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); // 첫 poll까지
  await worker.stop();
}

describe("createStatementSyncWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("추출 성공 — index 파생·claim 무확신 guess 보정 후 apply_ingestion_changeset 호출", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
    });
    const llm = mockLlm([
      { content: "확정 결정.", type: "claim", confidence: "certain" },
      { content: "확신도 빠진 추정.", type: "claim", confidence: null },
      { content: "할 일.", type: "todo", confidence: null },
    ]);

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    const applies = rpcCalls(rpc, "apply_ingestion_changeset");
    expect(applies).toHaveLength(1);
    expect(applies[0][1]).toEqual({
      p_source_id: SOURCE_ID,
      p_statements: [
        {
          content: "확정 결정.",
          type: "claim",
          confidence: "certain",
          index: 0,
        },
        {
          content: "확신도 빠진 추정.",
          type: "claim",
          confidence: "guess",
          index: 1,
        },
        { content: "할 일.", type: "todo", confidence: null, index: 2 },
      ],
    });
    // 메시지는 ack됐다
    expect(rpcCalls(rpc, "ack_sync_event")).toHaveLength(1);
  });

  it("진술 0개(노이즈뿐) — changeset 없이 complete_source_extraction만 호출", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
    });

    await runOnePoll({
      supabase: client,
      llm: mockLlm([]),
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    expect(rpcCalls(rpc, "apply_ingestion_changeset")).toHaveLength(0);
    const completes = rpcCalls(rpc, "complete_source_extraction");
    expect(completes).toHaveLength(1);
    expect(completes[0][1]).toEqual({ p_source_id: SOURCE_ID });
  });

  it("추출 LLM 실패 — increment_source_extraction_retry에 에러 메시지 기록", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
    });
    const llm: LlmProvider = {
      generateStructured: vi.fn().mockRejectedValue(new Error("llm boom")),
      async *generateStream() {
        yield "";
      },
      generateText: vi.fn().mockResolvedValue(""),
    };

    await runOnePoll({
      supabase: client,
      llm,
      embedding: mockEmbedding(),
      vectorStore: mockVectorStore(),
    });

    const retries = rpcCalls(rpc, "increment_source_extraction_retry");
    expect(retries).toHaveLength(1);
    expect(retries[0][1]).toMatchObject({
      p_source_id: SOURCE_ID,
      p_error_message: "llm boom",
    });
    expect(rpcCalls(rpc, "apply_ingestion_changeset")).toHaveLength(0);
  });

  it("임베딩 선언적 동기화 — active는 upsert, archived는 delete 후 각각 complete", async () => {
    const active = pendingStatement({ id: STMT_ID_1, status: "active" });
    const archived = pendingStatement({
      id: STMT_ID_2,
      status: "archived",
      type: "todo",
      confidence: null,
    });
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_statements: [[active, archived]],
    });
    const vectorStore = mockVectorStore();
    const embedding = mockEmbedding();

    await runOnePoll({
      supabase: client,
      llm: mockLlm([]),
      embedding,
      vectorStore,
    });

    expect(vectorStore.upsertStatements).toHaveBeenCalledTimes(1);
    expect(vectorStore.upsertStatements).toHaveBeenCalledWith(embedding, [
      {
        statementId: STMT_ID_1,
        spaceId: SPACE_ID,
        content: "테스트 진술",
        type: "claim",
        confidence: "certain",
        createdAt: "2026-06-11T00:00:00.000Z",
      },
    ]);
    expect(vectorStore.deleteStatements).toHaveBeenCalledWith([STMT_ID_2]);

    const completes = rpcCalls(rpc, "complete_statement_ingestion");
    expect(completes.map(([, args]) => args)).toEqual(
      expect.arrayContaining([
        { p_statement_id: STMT_ID_1 },
        { p_statement_id: STMT_ID_2 },
      ]),
    );
  });

  it("임베딩 배치 실패 — 배치원 전부 retry, complete는 호출되지 않음", async () => {
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_statements: [
        [
          pendingStatement({ id: STMT_ID_1 }),
          pendingStatement({ id: STMT_ID_2 }),
        ],
      ],
    });
    const vectorStore = mockVectorStore();
    vectorStore.upsertStatements = vi
      .fn()
      .mockRejectedValue(new Error("qdrant down"));

    await runOnePoll({
      supabase: client,
      llm: mockLlm([]),
      embedding: mockEmbedding(),
      vectorStore,
    });

    const retries = rpcCalls(rpc, "increment_statement_ingestion_retry");
    expect(retries.map(([, args]) => args)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_statement_id: STMT_ID_1,
          p_error_message: "qdrant down",
        }),
        expect.objectContaining({
          p_statement_id: STMT_ID_2,
          p_error_message: "qdrant down",
        }),
      ]),
    );
    expect(rpcCalls(rpc, "complete_statement_ingestion")).toHaveLength(0);
  });

  it("한 사이클에서 추출이 만든 진술을 이어서 임베딩한다 (추출 먼저, 임베딩 다음)", async () => {
    // 1차 임베딩 인출은 비고, 추출 후 2차 사이클 인출에서 진술이 나오는 시나리오
    const { client, rpc } = mockSupabase({
      read_sync_events: [[NOTIFY_ROW]],
      fetch_pending_sources: [[PENDING_SOURCE]],
      fetch_pending_statements: [[], [pendingStatement({})]],
    });
    const vectorStore = mockVectorStore();

    await runOnePoll({
      supabase: client,
      llm: mockLlm([
        { content: "결정.", type: "claim", confidence: "certain" },
      ]),
      embedding: mockEmbedding(),
      vectorStore,
    });

    expect(rpcCalls(rpc, "apply_ingestion_changeset")).toHaveLength(1);
    expect(vectorStore.upsertStatements).toHaveBeenCalledTimes(1);

    // 순서: apply가 upsert보다 먼저
    const applyOrder =
      rpc.mock.invocationCallOrder[
        rpc.mock.calls.findIndex(([n]) => n === "apply_ingestion_changeset")
      ];
    const upsertOrder = (
      vectorStore.upsertStatements as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];
    expect(applyOrder).toBeLessThan(upsertOrder);
  });
});
