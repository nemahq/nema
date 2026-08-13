import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EmbeddingProvider } from "@server/infra/embedding";
import { VECTOR_DIMENSION } from "@server/infra/embedding";

import type { QdrantClient } from "./qdrant-client";
import { createQdrantStore } from "./qdrant-store";
import type { DigestUpsertItem } from "./vector-store";
import { VectorStoreError } from "./vector-store";

function mockClient() {
  return {
    collectionExists: vi.fn().mockResolvedValue({ exists: true }),
    createCollection: vi.fn(),
    createPayloadIndex: vi.fn(),
    upsert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ points: [] }),
  } as unknown as QdrantClient & {
    collectionExists: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
}

function mockEmbedding(embeddings: number[][]): EmbeddingProvider {
  return {
    providerId: "test",
    model: "test-model",
    dimension: VECTOR_DIMENSION,
    embed: vi.fn().mockResolvedValue({
      embeddings,
      model: "test-model",
      dimension: VECTOR_DIMENSION,
    }),
  };
}

const DIGEST_ITEM: DigestUpsertItem = {
  digestId: "c0000000-0000-4000-a000-000000000001",
  userId: "b0000000-0000-4000-a000-000000000001",
  text: "제목: 테스트",
  createdAt: "2026-08-13T00:00:00.000Z",
};

describe("createQdrantStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upsertDigests — 임베딩 개수가 어긋나면 upsert 없이 거부한다", async () => {
    const client = mockClient();
    const store = createQdrantStore(client, "digests");
    // 다이제스트 2개에 벡터 1개 — 어긋난 벡터가 엉뚱한 digest_id에 기록되는 손상 방지
    const embedding = mockEmbedding([[0.1, 0.2]]);

    await expect(
      store.upsertDigests(embedding, [
        DIGEST_ITEM,
        { ...DIGEST_ITEM, digestId: "c0000000-0000-4000-a000-000000000002" },
      ]),
    ).rejects.toThrow(VectorStoreError);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("upsertDigests — point id는 digest_id, payload는 user_id로 필터링 가능한 값만 담는다", async () => {
    const client = mockClient();
    const store = createQdrantStore(client, "digests");
    const embedding = mockEmbedding([[0.1, 0.2]]);

    await store.upsertDigests(embedding, [DIGEST_ITEM]);

    expect(client.upsert).toHaveBeenCalledWith(
      "digests",
      expect.objectContaining({
        points: [
          expect.objectContaining({
            id: DIGEST_ITEM.digestId,
            vector: [0.1, 0.2],
            payload: expect.objectContaining({
              digest_id: DIGEST_ITEM.digestId,
              user_id: DIGEST_ITEM.userId,
            }),
          }),
        ],
      }),
    );
  });

  it("search — user_id로 검색을 격리한다(자기 것만 후보)", async () => {
    const client = mockClient();
    const store = createQdrantStore(client, "digests");
    const embedding = mockEmbedding([[0.1, 0.2]]);

    await store.search(embedding, {
      userId: "b0000000-0000-4000-a000-000000000001",
      query: "질문",
      limit: 10,
    });

    expect(client.query).toHaveBeenCalledWith(
      "digests",
      expect.objectContaining({
        filter: {
          must: [
            {
              key: "user_id",
              match: { value: "b0000000-0000-4000-a000-000000000001" },
            },
          ],
        },
      }),
    );
  });
});
