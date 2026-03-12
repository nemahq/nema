import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmbeddingProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import type { VectorStore } from "@server/infra/vector";

import type { DocumentSyncEvent, SyncMessage } from "./types";
import { createSyncWorker } from "./worker";

// --- Mock factories ---

function mockSupabase() {
  const rpc = vi.fn();
  return { rpc } as unknown as ReturnType<
    typeof import("@supabase/supabase-js").createClient
  >;
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
  return { embed: vi.fn().mockResolvedValue([[0.1, 0.2]]) };
}

function makeMessage(
  event: DocumentSyncEvent,
  overrides?: Partial<SyncMessage>,
): SyncMessage {
  return { msg_id: 1, read_ct: 1, message: event, ...overrides };
}

const CREATED_EVENT: DocumentSyncEvent = {
  type: "document.created",
  docId: "doc-1",
  userId: "user-1",
  body: "test body",
  tags: ["tag1"],
  summary: "test summary",
  entities: [{ type: "Person", name: "Alice" }],
};

const UPDATED_EVENT: DocumentSyncEvent = {
  type: "document.updated",
  docId: "doc-1",
  userId: "user-1",
  body: "updated body",
  tags: ["tag2"],
  summary: "updated summary",
  entities: [{ type: "Topic", name: "Testing" }],
};

const DELETED_EVENT: DocumentSyncEvent = {
  type: "document.deleted",
  docId: "doc-1",
};

// --- Tests ---

describe("createSyncWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ========== Happy path ==========

  describe("document.created", () => {
    it("upserts to vector + graph and acks", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage(CREATED_EVENT)],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }); // ack

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ docId: "doc-1", chunks: ["test body"] }),
      );
      expect(graphStore.upsertEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          docId: "doc-1",
          entities: [{ type: "Person", name: "Alice" }],
        }),
      );
      expect(rpc).toHaveBeenCalledWith("ack_sync_event", {
        p_msg_id: 1,
        p_doc_id: "doc-1",
      });
    });
  });

  describe("document.updated", () => {
    it("deletes old indices then re-creates, and acks", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage(UPDATED_EVENT)],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }); // ack

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      // Delete old
      expect(vectorStore.deleteByDocument).toHaveBeenCalledWith("doc-1");
      expect(graphStore.deleteByDocument).toHaveBeenCalledWith("doc-1");

      // Re-create
      expect(vectorStore.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ docId: "doc-1", chunks: ["updated body"] }),
      );
      expect(graphStore.upsertEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          docId: "doc-1",
          entities: [{ type: "Topic", name: "Testing" }],
        }),
      );

      // Delete happens before upsert
      const deleteOrder = (
        vectorStore.deleteByDocument as ReturnType<typeof vi.fn>
      ).mock.invocationCallOrder[0];
      const upsertOrder = (vectorStore.upsert as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(upsertOrder);

      expect(rpc).toHaveBeenCalledWith("ack_sync_event", {
        p_msg_id: 1,
        p_doc_id: "doc-1",
      });
    });
  });

  describe("document.deleted", () => {
    it("deletes from vector + graph and acks with null doc_id", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage(DELETED_EVENT)],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }); // ack

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.deleteByDocument).toHaveBeenCalledWith("doc-1");
      expect(graphStore.deleteByDocument).toHaveBeenCalledWith("doc-1");
      expect(rpc).toHaveBeenCalledWith("ack_sync_event", {
        p_msg_id: 1,
        p_doc_id: null,
      });
    });
  });

  describe("batch processing", () => {
    it("processes multiple messages in order", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc
        .mockResolvedValueOnce({
          data: [
            makeMessage(CREATED_EVENT, { msg_id: 1 }),
            makeMessage(DELETED_EVENT, { msg_id: 2 }),
          ],
          error: null,
        })
        .mockResolvedValue({ data: null, error: null }); // acks

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(rpc).toHaveBeenCalledWith("ack_sync_event", {
        p_msg_id: 1,
        p_doc_id: "doc-1",
      });
      expect(rpc).toHaveBeenCalledWith("ack_sync_event", {
        p_msg_id: 2,
        p_doc_id: null,
      });
    });
  });

  // ========== Edge cases ==========

  describe("empty queue", () => {
    it("does nothing when no messages", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      rpc.mockResolvedValue({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(vectorStore.upsert).not.toHaveBeenCalled();
      expect(graphStore.upsertEntities).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(1); // only read_sync_events
    });
  });

  describe("read error from pgmq", () => {
    it("logs error and continues without crashing", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      rpc.mockResolvedValue({
        data: null,
        error: { message: "connection lost" },
      });

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[sync-worker] read error:",
        expect.objectContaining({ message: "connection lost" }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("transient failure (below max retries)", () => {
    it("does not nack — message will retry via visibility timeout", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      (vectorStore.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Qdrant timeout"),
      );

      rpc.mockResolvedValueOnce({
        data: [makeMessage(CREATED_EVENT, { read_ct: 2 })],
        error: null,
      });

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      // Should NOT call nack (read_ct 2 < MAX_RETRIES 5)
      expect(rpc).not.toHaveBeenCalledWith(
        "nack_sync_event",
        expect.anything(),
      );
      // Should NOT call ack either
      expect(rpc).not.toHaveBeenCalledWith("ack_sync_event", expect.anything());

      consoleSpy.mockRestore();
    });
  });

  describe("permanent failure (max retries exceeded)", () => {
    it("nacks with doc_id for create/update events", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      (vectorStore.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("persistent failure"),
      );

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage(CREATED_EVENT, { msg_id: 99, read_ct: 5 })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }); // nack

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(rpc).toHaveBeenCalledWith("nack_sync_event", {
        p_msg_id: 99,
        p_doc_id: "doc-1",
      });

      consoleSpy.mockRestore();
    });

    it("nacks with null doc_id for delete events", async () => {
      const supabase = mockSupabase();
      const vectorStore = mockVectorStore();
      const graphStore = mockGraphStore();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      (
        vectorStore.deleteByDocument as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("graph down"));

      rpc
        .mockResolvedValueOnce({
          data: [makeMessage(DELETED_EVENT, { msg_id: 77, read_ct: 6 })],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }); // nack

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore,
        graphStore,
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      expect(rpc).toHaveBeenCalledWith("nack_sync_event", {
        p_msg_id: 77,
        p_doc_id: null,
      });

      consoleSpy.mockRestore();
    });
  });

  describe("polling guard", () => {
    it("skips poll if previous poll is still processing", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

      // First read never resolves (simulates slow processing)
      let resolveFirst: (v: unknown) => void = () => {};
      const firstCall = new Promise((r) => {
        resolveFirst = r;
      });
      rpc.mockReturnValueOnce(firstCall);
      rpc.mockResolvedValue({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
      });
      worker.start();

      // Trigger another poll interval while first is still pending
      await vi.advanceTimersByTimeAsync(2000);

      // Only one read_sync_events call (the second poll was skipped)
      expect(rpc).toHaveBeenCalledTimes(1);

      // Cleanup
      resolveFirst({ data: [], error: null });
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();
    });
  });

  describe("start and stop", () => {
    it("can be stopped cleanly", async () => {
      const supabase = mockSupabase();
      const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
      rpc.mockResolvedValue({ data: [], error: null });

      const worker = createSyncWorker({
        supabase,
        embedding: mockEmbedding(),
        vectorStore: mockVectorStore(),
        graphStore: mockGraphStore(),
      });

      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();

      // After stop, advancing timers should not trigger more polls
      const callCount = rpc.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(rpc.mock.calls.length).toBe(callCount);
    });
  });
});
