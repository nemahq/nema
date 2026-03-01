import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmbeddingProvider } from "../embedding/index.js";
import { VectorStoreError } from "./qdrant-client.js";

const mockCollectionExists = vi.fn();
const mockCreateCollection = vi.fn();
const mockCreatePayloadIndex = vi.fn();
const mockUpsert = vi.fn();
const mockSearch = vi.fn();

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    collectionExists: mockCollectionExists,
    createCollection: mockCreateCollection,
    createPayloadIndex: mockCreatePayloadIndex,
    upsert: mockUpsert,
    search: mockSearch,
  })),
}));

vi.mock("../env.js", () => ({
  requireEnv: vi.fn((name: string) => `mock-${name}`),
}));

import { createVectorStore } from "./qdrant-client.js";

function fakeProvider(
  embeddings: number[][] = [[0.1, 0.2]],
): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension: 2,
    embed: vi.fn().mockResolvedValue({
      embeddings,
      model: "test-model",
      dimension: 2,
    }),
  };
}

describe("createVectorStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureCollection", () => {
    it("skips creation when collection exists", async () => {
      mockCollectionExists.mockResolvedValue({ exists: true });
      const store = createVectorStore();
      await store.ensureCollection();
      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it("creates collection and index when not exists", async () => {
      mockCollectionExists.mockResolvedValue({ exists: false });
      const store = createVectorStore();
      await store.ensureCollection();
      expect(mockCreateCollection).toHaveBeenCalledWith("documents", {
        vectors: { size: 1024, distance: "Cosine" },
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledWith("documents", {
        field_name: "user_id",
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

      const store = createVectorStore();
      await expect(store.ensureCollection()).resolves.toBeUndefined();
    });

    it("throws VectorStoreError when creation truly fails", async () => {
      mockCollectionExists.mockResolvedValue({ exists: false });
      mockCreateCollection.mockRejectedValue(new Error("connection refused"));

      const store = createVectorStore();
      await expect(store.ensureCollection()).rejects.toThrow(VectorStoreError);
    });
  });

  describe("upsert", () => {
    it("returns empty array for empty chunks", async () => {
      const store = createVectorStore();
      const provider = fakeProvider();
      const ids = await store.upsert(provider, {
        userId: "u1",
        contextId: "c1",
        chunks: [],
      });
      expect(ids).toHaveLength(0);
      expect(provider.embed).not.toHaveBeenCalled();
    });

    it("embeds chunks and upserts with correct payload", async () => {
      mockUpsert.mockResolvedValue({});
      const store = createVectorStore();
      const provider = fakeProvider([[0.1, 0.2]]);
      const ids = await store.upsert(provider, {
        userId: "u1",
        contextId: "c1",
        chunks: ["hello world"],
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
                user_id: "u1",
                context_id: "c1",
                chunk_index: 0,
                text: "hello world",
                embedding_model: "test/test-model",
              }),
            }),
          ]),
        }),
      );
    });

    it("includes metadata as nested field in payload", async () => {
      mockUpsert.mockResolvedValue({});
      const store = createVectorStore();
      const provider = fakeProvider([[0.1, 0.2]]);
      await store.upsert(provider, {
        userId: "u1",
        contextId: "c1",
        chunks: ["text"],
        metadata: { source: "manual" },
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        "documents",
        expect.objectContaining({
          points: expect.arrayContaining([
            expect.objectContaining({
              payload: expect.objectContaining({
                metadata: { source: "manual" },
              }),
            }),
          ]),
        }),
      );
    });

    it("throws VectorStoreError on embedding count mismatch", async () => {
      const store = createVectorStore();
      const provider = fakeProvider([[0.1, 0.2]]);
      // Provider returns 1 embedding but 2 chunks given
      await expect(
        store.upsert(provider, {
          userId: "u1",
          contextId: "c1",
          chunks: ["text1", "text2"],
        }),
      ).rejects.toThrow(VectorStoreError);
    });

    it("wraps Qdrant SDK errors in VectorStoreError", async () => {
      mockUpsert.mockRejectedValue(new Error("write timeout"));
      const store = createVectorStore();
      const provider = fakeProvider([[0.1, 0.2]]);

      const err = await store
        .upsert(provider, {
          userId: "u1",
          contextId: "c1",
          chunks: ["text"],
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
      const store = createVectorStore();
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

    it("adds context_id filter when provided", async () => {
      mockSearch.mockResolvedValue([]);
      const store = createVectorStore();
      const provider = fakeProvider([[0.1, 0.2]]);

      await store.search(provider, {
        userId: "u1",
        query: "q",
        contextId: "c1",
      });

      expect(mockSearch).toHaveBeenCalledWith(
        "documents",
        expect.objectContaining({
          filter: {
            must: [
              { key: "user_id", match: { value: "u1" } },
              { key: "context_id", match: { value: "c1" } },
            ],
          },
        }),
      );
    });

    it("passes score_threshold when provided", async () => {
      mockSearch.mockResolvedValue([]);
      const store = createVectorStore();
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
      const store = createVectorStore();
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

    it("throws VectorStoreError when embedding returns no vector", async () => {
      const store = createVectorStore();
      const provider = fakeProvider([]);

      await expect(
        store.search(provider, { userId: "u1", query: "q" }),
      ).rejects.toThrow(VectorStoreError);
    });

    it("wraps Qdrant SDK errors in VectorStoreError", async () => {
      const store = createVectorStore();
      const provider = fakeProvider([[0.1, 0.2]]);
      mockSearch.mockRejectedValue(new Error("collection not found"));

      const err = await store
        .search(provider, { userId: "u1", query: "q" })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VectorStoreError);
      expect((err as VectorStoreError).operation).toBe("search");
    });
  });
});
