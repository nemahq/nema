import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EmbeddingProvider } from "@server/infra/embedding/index";

import { VectorStoreError } from "./vector-store";

const mockCollectionExists = vi.fn();
const mockCreateCollection = vi.fn();
const mockCreatePayloadIndex = vi.fn();
const mockUpsert = vi.fn();
const mockSearch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    collectionExists: mockCollectionExists,
    createCollection: mockCreateCollection,
    createPayloadIndex: mockCreatePayloadIndex,
    upsert: mockUpsert,
    search: mockSearch,
    delete: mockDelete,
  })),
}));

vi.mock("@server/env", () => ({
  requireEnv: vi.fn((name: string) => `mock-${name}`),
}));

import { createQdrantStore } from "./qdrant-store";

function fakeProvider(
  embeddings: number[][] = [[0.1, 0.2]],
  dimension = 1024,
): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension,
    embed: vi.fn().mockResolvedValue({
      embeddings,
      model: "test-model",
      dimension,
    }),
  };
}

describe("createQdrantStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureCollection", () => {
    it("skips creation when collection exists", async () => {
      mockCollectionExists.mockResolvedValue({ exists: true });
      const store = createQdrantStore();
      await store.ensureCollection();
      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it("creates collection and indexes when not exists", async () => {
      mockCollectionExists.mockResolvedValue({ exists: false });
      const store = createQdrantStore();
      await store.ensureCollection();
      expect(mockCreateCollection).toHaveBeenCalledWith("documents", {
        vectors: { size: 1024, distance: "Cosine" },
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledWith("documents", {
        field_name: "user_id",
        field_schema: "keyword",
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledWith("documents", {
        field_name: "doc_id",
        field_schema: "keyword",
      });
    });

    it("tolerates race condition when collection created concurrently", async () => {
      mockCollectionExists
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true });
      mockCreateCollection.mockRejectedValue(
        new Error("collection already exists"),
      );

      const store = createQdrantStore();
      await expect(store.ensureCollection()).resolves.toBeUndefined();
    });

    it("throws VectorStoreError when creation truly fails", async () => {
      mockCollectionExists.mockResolvedValue({ exists: false });
      mockCreateCollection.mockRejectedValue(new Error("connection refused"));

      const store = createQdrantStore();
      await expect(store.ensureCollection()).rejects.toThrow(VectorStoreError);
    });

    it("throws VectorStoreError when payload index creation fails", async () => {
      mockCollectionExists.mockResolvedValue({ exists: false });
      mockCreateCollection.mockResolvedValue({});
      mockCreatePayloadIndex.mockRejectedValue(
        new Error("index creation failed"),
      );

      const store = createQdrantStore();
      await expect(store.ensureCollection()).rejects.toThrow(VectorStoreError);
    });

    it("still creates indexes after tolerating race condition", async () => {
      mockCollectionExists
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true });
      mockCreateCollection.mockRejectedValue(
        new Error("collection already exists"),
      );
      mockCreatePayloadIndex.mockResolvedValue({});

      const store = createQdrantStore();
      await store.ensureCollection();
      expect(mockCreatePayloadIndex).toHaveBeenCalledWith("documents", {
        field_name: "user_id",
        field_schema: "keyword",
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledWith("documents", {
        field_name: "doc_id",
        field_schema: "keyword",
      });
    });

    it("throws VectorStoreError when re-check itself fails", async () => {
      mockCollectionExists
        .mockResolvedValueOnce({ exists: false })
        .mockRejectedValueOnce(new Error("network down"));
      mockCreateCollection.mockRejectedValue(new Error("timeout"));

      const store = createQdrantStore();
      await expect(store.ensureCollection()).rejects.toThrow(VectorStoreError);
    });
  });

  describe("upsert", () => {
    it("returns empty array for empty chunks", async () => {
      const store = createQdrantStore();
      const provider = fakeProvider();
      const ids = await store.upsert(provider, {
        docId: "d1",
        userId: "u1",
        chunks: [],
        tags: ["tag1"],
        summary: "summary",
      });
      expect(ids).toHaveLength(0);
      expect(provider.embed).not.toHaveBeenCalled();
    });

    it("embeds chunks and upserts with correct payload", async () => {
      mockUpsert.mockResolvedValue({});
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]]);
      const ids = await store.upsert(provider, {
        docId: "d1",
        userId: "u1",
        chunks: ["hello world"],
        tags: ["hiring", "frontend"],
        summary: "Interview feedback",
      });

      expect(ids).toHaveLength(1);
      expect(provider.embed).toHaveBeenCalledWith(["hello world"], "document");
      expect(mockUpsert).toHaveBeenCalledWith(
        "documents",
        expect.objectContaining({
          wait: true,
          points: expect.arrayContaining([
            expect.objectContaining({
              payload: expect.objectContaining({
                doc_id: "d1",
                user_id: "u1",
                chunk_index: 0,
                text: "hello world",
                tags: ["hiring", "frontend"],
                summary: "Interview feedback",
                embedding_model: "test/test-model",
              }),
            }),
          ]),
        }),
      );
    });

    it("handles multi-chunk upsert with correct chunk_index values", async () => {
      mockUpsert.mockResolvedValue({});
      const store = createQdrantStore();
      const provider = fakeProvider([
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
      ]);
      const ids = await store.upsert(provider, {
        docId: "d1",
        userId: "u1",
        chunks: ["chunk-0", "chunk-1", "chunk-2"],
        tags: ["t1"],
        summary: "s",
      });

      expect(ids).toHaveLength(3);
      expect(provider.embed).toHaveBeenCalledWith(
        ["chunk-0", "chunk-1", "chunk-2"],
        "document",
      );

      const points = mockUpsert.mock.calls[0][1].points;
      expect(points[0].payload.chunk_index).toBe(0);
      expect(points[0].payload.text).toBe("chunk-0");
      expect(points[1].payload.chunk_index).toBe(1);
      expect(points[1].payload.text).toBe("chunk-1");
      expect(points[2].payload.chunk_index).toBe(2);
      expect(points[2].payload.text).toBe("chunk-2");
    });

    it("throws VectorStoreError when provider dimension mismatches", async () => {
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]], 512);
      await expect(
        store.upsert(provider, {
          docId: "d1",
          userId: "u1",
          chunks: ["text"],
          tags: [],
          summary: "s",
        }),
      ).rejects.toThrow(VectorStoreError);
    });

    it("throws VectorStoreError on embedding count mismatch", async () => {
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]]);
      await expect(
        store.upsert(provider, {
          docId: "d1",
          userId: "u1",
          chunks: ["text1", "text2"],
          tags: [],
          summary: "s",
        }),
      ).rejects.toThrow(VectorStoreError);
    });

    it("wraps Qdrant SDK errors in VectorStoreError", async () => {
      mockUpsert.mockRejectedValue(new Error("write timeout"));
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]]);

      const err = await store
        .upsert(provider, {
          docId: "d1",
          userId: "u1",
          chunks: ["text"],
          tags: [],
          summary: "s",
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VectorStoreError);
      expect((err as VectorStoreError).operation).toBe("upsert");
    });
  });

  describe("search", () => {
    it("embeds query and searches with user filter", async () => {
      mockSearch.mockResolvedValue([
        { id: "abc", score: 0.95, payload: { text: "hello" } },
      ]);
      const store = createQdrantStore();
      const provider = fakeProvider([[0.5, 0.6]]);

      const results = await store.search(provider, {
        userId: "u1",
        query: "test query",
        limit: 5,
      });

      expect(provider.embed).toHaveBeenCalledWith(["test query"], "query");
      expect(mockSearch).toHaveBeenCalledWith(
        "documents",
        expect.objectContaining({
          vector: [0.5, 0.6],
          limit: 5,
          filter: {
            must: [{ key: "user_id", match: { value: "u1" } }],
          },
          with_payload: true,
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
    });

    it("passes score_threshold when provided", async () => {
      mockSearch.mockResolvedValue([]);
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]]);

      await store.search(provider, {
        userId: "u1",
        query: "q",
        scoreThreshold: 0.7,
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "documents",
        expect.objectContaining({
          score_threshold: 0.7,
        }),
      );
    });

    it("uses default limit of 10", async () => {
      mockSearch.mockResolvedValue([]);
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]]);

      await store.search(provider, {
        userId: "u1",
        query: "q",
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "documents",
        expect.objectContaining({ limit: 10 }),
      );
    });

    it("throws VectorStoreError when provider dimension mismatches", async () => {
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]], 512);
      await expect(
        store.search(provider, { userId: "u1", query: "q" }),
      ).rejects.toThrow(VectorStoreError);
    });

    it("throws VectorStoreError when embedding returns no vector", async () => {
      const store = createQdrantStore();
      const provider = fakeProvider([]);

      await expect(
        store.search(provider, { userId: "u1", query: "q" }),
      ).rejects.toThrow(VectorStoreError);
    });

    it("wraps Qdrant SDK errors in VectorStoreError", async () => {
      const store = createQdrantStore();
      const provider = fakeProvider([[0.1, 0.2]]);
      mockSearch.mockRejectedValue(new Error("collection not found"));

      const err = await store
        .search(provider, { userId: "u1", query: "q" })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VectorStoreError);
      expect((err as VectorStoreError).operation).toBe("search");
    });
  });

  describe("deleteByDocument", () => {
    it("deletes points by doc_id filter", async () => {
      mockDelete.mockResolvedValue({});
      const store = createQdrantStore();
      await store.deleteByDocument("d1");

      expect(mockDelete).toHaveBeenCalledWith("documents", {
        wait: true,
        filter: {
          must: [{ key: "doc_id", match: { value: "d1" } }],
        },
      });
    });

    it("wraps Qdrant SDK errors in VectorStoreError", async () => {
      mockDelete.mockRejectedValue(new Error("connection refused"));
      const store = createQdrantStore();

      const err = await store.deleteByDocument("d1").catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VectorStoreError);
      expect((err as VectorStoreError).operation).toBe("deleteByDocument");
    });
  });
});
