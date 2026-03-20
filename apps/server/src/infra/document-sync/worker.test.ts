import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";

import type { EmbeddingProvider } from "@server/infra/embedding";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import type { GraphStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import type { VectorStore } from "@server/infra/vector";

import type { PendingDocument, SyncEvent, TriggerMessage } from "./types";
import { createSyncWorker } from "./worker";

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
    deleteByDocument: vi.fn().mockResolvedValue(undefined),
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
  body_en: null,
  tags: ["tag1"],
  tags_en: null,
  summary: "test summary",
  summary_en: null,
};

const PENDING_DOC_BILINGUAL: PendingDocument = {
  id: DOC_ID_1,
  user_id: USER_ID,
  body: "한국어 본문",
  body_en: "English body",
  tags: ["태그1"],
  tags_en: ["tag1"],
  summary: "한국어 요약",
  summary_en: "English summary",
};

// --- Tests ---

describe("createSyncWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
        // fetch_pending_documents → 1 doc
        .mockResolvedValueOnce({ data: [PENDING_DOC], error: null })
        // fetch_pending_documents → empty (cycle ends)
        .mockResolvedValueOnce({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      // LLM으로 엔티티 추출
      expect(llm.generateStructured).toHaveBeenCalledWith(
        expect.objectContaining({ schemaName: "entity_extraction" }),
      );

      // vector + graph upsert
      expect(vectorStore.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ docId: DOC_ID_1, chunks: ["test body"] }),
      );
      expect(graphStore.upsertEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          docId: DOC_ID_1,
          entities: [{ type: "Person", name: "Alice" }],
        }),
      );

      // completed 마킹
      expect(supabase._fromChain.update).toHaveBeenCalledWith({
        ingestion_status: "completed",
      });
      expect(supabase._fromChain.eq).toHaveBeenCalledWith("id", DOC_ID_1);
    });
  });

  // ========== Bilingual document ==========

  describe("bilingual document → English content used for engine", () => {
    it("비영어 문서는 _en 필드로 벡터·엔티티 처리", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const llm = mockLlm();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage({ type: "notify" })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({
          data: [PENDING_DOC_BILINGUAL],
          error: null,
        })
        .mockResolvedValueOnce({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          docId: DOC_ID_1,
          chunks: ["English body"],
          tags: ["tag1"],
          summary: "English summary",
        }),
      );
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
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.deleteByDocument).toHaveBeenCalledWith(DOC_ID_1);
      expect(graphStore.deleteByDocument).toHaveBeenCalledWith(DOC_ID_1);
      expect(rpc).toHaveBeenCalledWith("ack_sync_event", { p_msg_id: 1 });
      expect(rpc).not.toHaveBeenCalledWith(
        "fetch_pending_documents",
        expect.anything(),
      );
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
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.deleteByDocument).toHaveBeenCalledWith(DOC_ID_DEL);
      expect(rpc).toHaveBeenCalledWith("fetch_pending_documents", {
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
        body_en: null,
        tags: [],
        tags_en: null,
        summary: "fail",
        summary_en: null,
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
        // increment_ingestion_retry for doc-2
        .mockResolvedValueOnce({ data: null, error: null })
        // fetch_pending → empty
        .mockResolvedValueOnce({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      // doc-1 completed
      expect(supabase._fromChain.update).toHaveBeenCalledWith({
        ingestion_status: "completed",
      });
      expect(supabase._fromChain.eq).toHaveBeenCalledWith("id", DOC_ID_1);

      // doc-2 retry incremented
      expect(rpc).toHaveBeenCalledWith("increment_ingestion_retry", {
        p_doc_id: DOC_ID_2,
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
      });

      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      const callCount = rpc.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(rpc.mock.calls.length).toBe(callCount);
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
        body_en: null,
        tags: ["tag2"],
        tags_en: null,
        summary: "second",
        summary_en: null,
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
        // fetch_pending round 2 → doc-2 (appeared during round 1)
        .mockResolvedValueOnce({ data: [doc2], error: null })
        // fetch_pending round 3 → empty
        .mockResolvedValueOnce({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        llm,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(llm.generateStructured).toHaveBeenCalledTimes(2);
      expect(vectorStore.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
