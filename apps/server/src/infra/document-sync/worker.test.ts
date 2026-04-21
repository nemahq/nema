import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { EntityVectorStore, VectorStore } from "@server/infra/vector";

import type { PendingDocument, SyncEvent, TriggerMessage } from "./types";
import { createSyncWorker } from "./worker";

vi.mock("./propagation", () => ({
  runPropagation: vi.fn().mockResolvedValue(undefined),
}));

import { runPropagation } from "./propagation";

// --- Mock factories ---

function mockSupabase() {
  const rpc = vi.fn();
  const fromChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  const from = vi.fn().mockReturnValue(fromChain);
  return { rpc, from, _fromChain: fromChain } as unknown as ReturnType<
    typeof import("@supabase/supabase-js").createClient
  > & { _fromChain: typeof fromChain };
}

function mockVectorStore(): VectorStore {
  return {
    ensureCollection: vi.fn(),
    upsert: vi.fn().mockResolvedValue(["vec-1"]),
    search: vi.fn().mockResolvedValue([]),
    deleteByDocument: vi.fn().mockResolvedValue(undefined),
  };
}

function mockGraphStore(): GraphStore {
  return {
    ensureSchema: vi.fn(),
    upsertEntities: vi.fn().mockResolvedValue(undefined),
    findRelatedDocuments: vi.fn().mockResolvedValue([]),
    findDocumentsByEntities: vi.fn().mockResolvedValue([]),
    listEntities: vi.fn().mockResolvedValue([]),
    mergeEntities: vi.fn().mockResolvedValue(undefined),
    deleteByDocument: vi.fn().mockResolvedValue([]),
  } as unknown as GraphStore;
}

function mockEmbedding(): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension: 2,
    embed: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  };
}

function mockLlm(): LlmProvider {
  return {
    generateStructured: vi.fn().mockResolvedValue({
      entities: [{ type: "Person", name: "Alice" }],
    }),
    async *generateStream() {
      yield "";
    },
    generateText: vi.fn().mockResolvedValue(""),
  };
}

function mockEntityVectorStore(): EntityVectorStore {
  return {
    ensureCollection: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    deleteByEntities: vi.fn().mockResolvedValue(undefined),
    pruneOrphans: vi.fn().mockResolvedValue(0),
  };
}

function makeMessage(
  event: SyncEvent,
  overrides?: Partial<TriggerMessage>,
): TriggerMessage {
  return { msg_id: 1, read_ct: 1, message: event, ...overrides };
}

const DOC_ID_1 = "a0000000-0000-4000-a000-000000000001";
const DOC_ID_2 = "a0000000-0000-4000-a000-000000000002";
const DOC_ID_DEL = "a0000000-0000-4000-a000-0000000000dd";
const USER_ID = "b0000000-0000-4000-a000-000000000001";

const PENDING_DOC: PendingDocument = {
  id: DOC_ID_1,
  user_id: USER_ID,
  body: "test body",
  tags: ["tag1"],
  summary: "test summary",
  created_at: "2026-04-01T00:00:00.000Z",
  history_id: null,
};

// --- Tests ---

describe("createSyncWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ========== Batch processing ==========

  describe("notify trigger → batch cycle", () => {
    it("fetches pending docs, processes via LLM + vector + graph, marks completed", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const llm = mockLlm();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        // read_sync_events → notify trigger
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "notify" })],
          error: null,
        })
        // ack_sync_event
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending_memories → 1 doc
        .mockResolvedValueOnce({ data: [PENDING_DOC], error: null })
        // complete_memory_ingestion
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending_memories → empty (cycle ends)
        .mockResolvedValueOnce({ data: [], error: null });

      const entityVectorStore = mockEntityVectorStore();
      const worker = createSyncWorker({
        supabase,
        llm,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
        entityVectorStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      // LLM으로 엔티티 추출
      expect(llm.generateStructured).toHaveBeenCalledWith(
        expect.objectContaining({ schemaName: "entity_extraction" }),
      );

      // vector + graph + entity vector upsert
      expect(vectorStore.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ docId: DOC_ID_1, chunks: ["test body"] }),
      );
      expect(graphStore.upsertEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          docId: DOC_ID_1,
          entities: [
            expect.objectContaining({
              type: "Person",
              name: "Alice",
            }),
          ],
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      );
      expect(entityVectorStore.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: USER_ID,
          entities: [
            expect.objectContaining({ name: "Alice", type: "Person" }),
          ],
        }),
      );

      // completed 마킹
      expect(rpc).toHaveBeenCalledWith("complete_memory_ingestion", {
        p_memory_id: DOC_ID_1,
      });
    });
  });

  // ========== Delete ==========

  describe("document.deleted", () => {
    it("deletes from vector + graph and acks", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "document.deleted", docId: DOC_ID_1 })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }); // ack

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.deleteByDocument).toHaveBeenCalledWith(DOC_ID_1);
      expect(graphStore.deleteByDocument).toHaveBeenCalledWith(DOC_ID_1);
      expect(rpc).toHaveBeenCalledWith("ack_sync_event", { p_msg_id: 1 });
      expect(rpc).not.toHaveBeenCalledWith(
        "fetch_pending_memories",
        expect.anything(),
      );
    });

    it("삭제된 orphan 엔티티를 Qdrant에서도 정리한다", async () => {
      const supabase = mockSupabase();
      const graphStore = mockGraphStore();
      const entityVectorStore = mockEntityVectorStore();
      const orphaned = [
        { userId: USER_ID, type: "Person" as const, name: "Alice" },
        { userId: USER_ID, type: "Topic" as const, name: "검색" },
      ];
      (
        graphStore.deleteByDocument as ReturnType<typeof vi.fn>
      ).mockResolvedValue(orphaned);

      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "document.deleted", docId: DOC_ID_1 })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null });

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore,
        entityVectorStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(entityVectorStore.deleteByEntities).toHaveBeenCalledWith(orphaned);
    });

    it("orphan이 없으면 Qdrant 삭제를 호출하지 않는다", async () => {
      const supabase = mockSupabase();
      const entityVectorStore = mockEntityVectorStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "document.deleted", docId: DOC_ID_1 })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null });

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(entityVectorStore.deleteByEntities).not.toHaveBeenCalled();
    });
  });

  // ========== Entity orphan prune (daily batch) ==========

  describe("runEntityOrphanPrune (24h interval)", () => {
    const ENTITY_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
    const ENTITY_PRUNE_LIST_LIMIT = 10_000;

    function setupPruneRpc(
      rpc: ReturnType<typeof vi.fn>,
      userIds: Array<{ user_id: string }>,
    ): void {
      rpc.mockImplementation((name: string) => {
        if (name === "list_memory_user_ids") {
          return Promise.resolve({ data: userIds, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      });
    }

    it("각 userId별로 pruneOrphans를 호출한다", async () => {
      const supabase = mockSupabase();
      const graphStore = mockGraphStore();
      const entityVectorStore = mockEntityVectorStore();
      setupPruneRpc(supabase.rpc as ReturnType<typeof vi.fn>, [
        { user_id: "u1" },
        { user_id: "u2" },
      ]);
      (graphStore.listEntities as ReturnType<typeof vi.fn>).mockResolvedValue([
        { type: "Person", name: "Alice" },
      ]);

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore,
        entityVectorStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(ENTITY_PRUNE_INTERVAL_MS);
      await worker.stop();

      expect(entityVectorStore.pruneOrphans).toHaveBeenCalledTimes(2);
      expect(entityVectorStore.pruneOrphans).toHaveBeenCalledWith({
        userId: "u1",
        liveEntities: [{ type: "Person", name: "Alice" }],
      });
      expect(entityVectorStore.pruneOrphans).toHaveBeenCalledWith({
        userId: "u2",
        liveEntities: [{ type: "Person", name: "Alice" }],
      });
    });

    it("listEntities가 limit에 도달하면 false-positive 방지를 위해 스킵한다", async () => {
      const supabase = mockSupabase();
      const graphStore = mockGraphStore();
      const entityVectorStore = mockEntityVectorStore();
      setupPruneRpc(supabase.rpc as ReturnType<typeof vi.fn>, [
        { user_id: "u1" },
      ]);

      const fullBatch = Array.from(
        { length: ENTITY_PRUNE_LIST_LIMIT },
        (_, i) => ({ type: "Person" as const, name: `entity-${i}` }),
      );
      (graphStore.listEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        fullBatch,
      );

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore,
        entityVectorStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(ENTITY_PRUNE_INTERVAL_MS);
      await worker.stop();

      expect(entityVectorStore.pruneOrphans).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("skipping prune"),
        expect.objectContaining({ level: "warning" }),
      );
    });

    it("단일 userId 에러가 다른 userId 처리를 막지 않는다", async () => {
      const supabase = mockSupabase();
      const graphStore = mockGraphStore();
      const entityVectorStore = mockEntityVectorStore();
      setupPruneRpc(supabase.rpc as ReturnType<typeof vi.fn>, [
        { user_id: "u1" },
        { user_id: "u2" },
      ]);
      (graphStore.listEntities as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("neo4j transient"))
        .mockResolvedValueOnce([{ type: "Person", name: "Alice" }]);

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore,
        entityVectorStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(ENTITY_PRUNE_INTERVAL_MS);
      await worker.stop();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ extra: { userId: "u1" } }),
      );
      expect(entityVectorStore.pruneOrphans).toHaveBeenCalledWith({
        userId: "u2",
        liveEntities: [{ type: "Person", name: "Alice" }],
      });
    });
  });

  // ========== Mixed batch ==========

  describe("mixed notify + delete in one poll", () => {
    it("handles delete first, then runs batch cycle", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [
            makeMessage(
              { type: "document.deleted", docId: DOC_ID_DEL },
              { msg_id: 1 },
            ),
            makeMessage({ type: "notify" }, { msg_id: 2 }),
          ],
          error: null,
        })
        // ack msg 1
        .mockResolvedValueOnce({ data: null, error: null })
        // ack msg 2
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending → empty
        .mockResolvedValueOnce({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.deleteByDocument).toHaveBeenCalledWith(DOC_ID_DEL);
      expect(rpc).toHaveBeenCalledWith("fetch_pending_memories", {
        p_max_retries: 5,
      });
    });
  });

  // ========== Empty queue ==========

  describe("empty queue", () => {
    it("does nothing when no messages", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc.mockResolvedValue({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.upsert).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(1); // only read_sync_events
    });
  });

  // ========== Partial failure ==========

  describe("partial failure in batch", () => {
    it("marks successful doc completed, increments retry for failed doc", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const llm = mockLlm();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      const doc2: PendingDocument = {
        id: DOC_ID_2,
        user_id: USER_ID,
        body: "fail body",
        tags: [],
        summary: "fail",
        created_at: "2026-04-02T00:00:00.000Z",
        history_id: null,
      };

      // LLM succeeds for doc-1, fails for doc-2
      (llm.generateStructured as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          entities: [{ type: "Person", name: "Alice" }],
        })
        .mockRejectedValueOnce(new Error("LLM timeout"));

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "notify" })],
          error: null,
        })
        // ack
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending → 2 docs
        .mockResolvedValueOnce({ data: [PENDING_DOC, doc2], error: null })
        // complete_memory_ingestion for doc-1
        .mockResolvedValueOnce({ data: null, error: null })
        // increment_memory_ingestion_retry for doc-2
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending → empty
        .mockResolvedValueOnce({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      // doc-1 completed
      expect(rpc).toHaveBeenCalledWith("complete_memory_ingestion", {
        p_memory_id: DOC_ID_1,
      });

      // doc-2 retry incremented
      expect(rpc).toHaveBeenCalledWith("increment_memory_ingestion_retry", {
        p_memory_id: DOC_ID_2,
        p_max_retries: 5,
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "LLM timeout" }),
        expect.objectContaining({
          tags: expect.objectContaining({ component: "sync-worker" }),
          extra: { docId: DOC_ID_2 },
        }),
      );
    });
  });

  // ========== Read error ==========

  describe("read error from pgmq", () => {
    it("reports error to Sentry and continues without crashing", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc.mockResolvedValue({
        data: null,
        error: { message: "connection lost" },
      });

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("connection lost"),
        expect.objectContaining({ level: "error" }),
      );
    });
  });

  // ========== Polling guard ==========

  describe("polling guard", () => {
    it("skips poll if previous poll is still processing", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      let resolveFirst: (v: unknown) => void = () => {};
      const firstCall = new Promise((r) => {
        resolveFirst = r;
      });
      rpc.mockReturnValueOnce(firstCall);
      rpc.mockResolvedValue({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();

      await vi.advanceTimersByTimeAsync(2000);

      expect(rpc).toHaveBeenCalledTimes(1);

      resolveFirst({ data: [], error: null });
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();
    });
  });

  // ========== Start and stop ==========

  describe("start and stop", () => {
    it("can be stopped cleanly", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      rpc.mockResolvedValue({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
      });

      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      const callCount = rpc.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(rpc.mock.calls.length).toBe(callCount);
    });
  });

  // ========== Phase 4 depth ==========

  describe("Phase 4 propagation depth", () => {
    it("depth=0 완료 후 send_memory_sync_notify(depth=1) 호출", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "notify" })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }) // ack
        .mockResolvedValueOnce({ data: [PENDING_DOC], error: null }) // fetch_pending
        .mockResolvedValueOnce({ data: null, error: null }) // complete
        .mockResolvedValueOnce({ data: [], error: null }) // fetch_pending empty
        .mockResolvedValueOnce({ data: null, error: null }); // send_memory_sync_notify

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(rpc).toHaveBeenCalledWith("send_memory_sync_notify", {
        p_propagation_depth: 1,
      });
    });

    it("depth=1 수신 시 Phase 4 실행 + send_memory_sync_notify(depth=2) 호출", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "notify", propagation_depth: 1 })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }) // ack
        .mockResolvedValueOnce({ data: [PENDING_DOC], error: null }) // fetch_pending
        .mockResolvedValueOnce({ data: null, error: null }) // complete
        .mockResolvedValueOnce({ data: [], error: null }) // fetch_pending empty
        .mockResolvedValueOnce({ data: null, error: null }); // send_memory_sync_notify

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(runPropagation).toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith("send_memory_sync_notify", {
        p_propagation_depth: 2,
      });
    });

    it("depth=2 notify 수신 시 Phase 4 skip — send_memory_sync_notify 미호출", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "notify", propagation_depth: 2 })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }) // ack
        .mockResolvedValueOnce({ data: [PENDING_DOC], error: null }) // fetch_pending
        .mockResolvedValueOnce({ data: null, error: null }) // complete
        .mockResolvedValueOnce({ data: [], error: null }); // fetch_pending empty

      const worker = createSyncWorker({
        supabase,
        llm: mockLlm(),
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      const rpcCalls = (rpc as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0],
      );
      expect(rpcCalls).not.toContain("send_memory_sync_notify");
      expect(runPropagation).not.toHaveBeenCalled();
    });
  });

  // ========== Pending cycle ==========

  describe("pending cycle loops until empty", () => {
    it("processes multiple rounds until no pending docs remain", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const llm = mockLlm();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      const doc2: PendingDocument = {
        id: DOC_ID_2,
        user_id: USER_ID,
        body: "second doc",
        tags: ["tag2"],
        summary: "second",
        created_at: "2026-04-02T00:00:00.000Z",
        history_id: null,
      };

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "notify" })],
          error: null,
        })
        // ack
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending round 1 → doc-1
        .mockResolvedValueOnce({ data: [PENDING_DOC], error: null })
        // complete_memory_ingestion for doc-1
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending round 2 → doc-2 (appeared during round 1)
        .mockResolvedValueOnce({ data: [doc2], error: null })
        // complete_memory_ingestion for doc-2
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending round 3 → empty
        .mockResolvedValueOnce({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
        entityVectorStore: mockEntityVectorStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(llm.generateStructured).toHaveBeenCalledTimes(2);
      expect(vectorStore.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
