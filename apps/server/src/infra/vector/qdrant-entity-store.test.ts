import { v5 as uuidv5 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VectorStoreError } from "./vector-store";

const mockDelete = vi.fn();
const mockScroll = vi.fn();
const mockUpsert = vi.fn();
const mockSearch = vi.fn();

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    delete: mockDelete,
    scroll: mockScroll,
    upsert: mockUpsert,
    search: mockSearch,
  })),
}));

vi.mock("@server/env", () => ({
  getEnv: vi.fn(() => ({
    QDRANT_URL: "http://mock-qdrant",
    QDRANT_API_KEY: "mock-key",
  })),
}));

import type { QdrantClient } from "./qdrant-client";
import { createQdrantEntityStore } from "./qdrant-entity-store";

const mockClient = {
  delete: mockDelete,
  scroll: mockScroll,
  upsert: mockUpsert,
  search: mockSearch,
} as unknown as QdrantClient;

const NAMESPACE = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const USER_ID = "user-1";
const pointId = (type: string, name: string): string =>
  uuidv5(`${USER_ID}:${type}:${name}`, NAMESPACE);

describe("createQdrantEntityStore", () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockScroll.mockReset();
    mockUpsert.mockReset();
    mockSearch.mockReset();
  });

  describe("deleteByEntities", () => {
    it("동일 namespace + userId + type + name → 결정론적 ID로 삭제", async () => {
      const store = createQdrantEntityStore(mockClient);
      mockDelete.mockResolvedValue(undefined);

      await store.deleteByEntities([
        { userId: USER_ID, type: "Person", name: "Alice" },
        { userId: USER_ID, type: "Topic", name: "검색" },
      ]);

      expect(mockDelete).toHaveBeenCalledWith("entities", {
        wait: true,
        points: [pointId("Person", "Alice"), pointId("Topic", "검색")],
      });
    });

    it("빈 배열은 호출하지 않는다", async () => {
      const store = createQdrantEntityStore(mockClient);
      await store.deleteByEntities([]);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("실패 시 VectorStoreError로 래핑", async () => {
      const store = createQdrantEntityStore(mockClient);
      mockDelete.mockRejectedValue(new Error("qdrant down"));
      await expect(
        store.deleteByEntities([
          { userId: USER_ID, type: "Person", name: "Alice" },
        ]),
      ).rejects.toThrow(VectorStoreError);
    });
  });

  describe("pruneOrphans", () => {
    it("Qdrant 포인트 중 liveIds에 없는 것만 삭제", async () => {
      const store = createQdrantEntityStore(mockClient);
      mockScroll.mockResolvedValueOnce({
        points: [
          { id: pointId("Person", "Alice") }, // live
          { id: pointId("Person", "Ghost") }, // orphan
        ],
        next_page_offset: null,
      });
      mockDelete.mockResolvedValue(undefined);

      const pruned = await store.pruneOrphans({
        userId: USER_ID,
        liveEntities: [{ type: "Person", name: "Alice" }],
      });

      expect(pruned).toBe(1);
      expect(mockDelete).toHaveBeenCalledWith("entities", {
        wait: true,
        points: [pointId("Person", "Ghost")],
      });
    });

    it("다중 페이지 스크롤 — next_page_offset 커서 추적", async () => {
      const store = createQdrantEntityStore(mockClient);
      mockScroll
        .mockResolvedValueOnce({
          points: [{ id: pointId("Person", "P1") }],
          next_page_offset: "cursor-xyz",
        })
        .mockResolvedValueOnce({
          points: [{ id: pointId("Person", "P2") }],
          next_page_offset: null,
        });
      mockDelete.mockResolvedValue(undefined);

      const pruned = await store.pruneOrphans({
        userId: USER_ID,
        liveEntities: [],
      });

      // liveEntities 빈 배열 방어로 0 반환, scroll 호출 안 됨
      expect(pruned).toBe(0);
      expect(mockScroll).not.toHaveBeenCalled();
    });

    it("다중 페이지 스크롤 — liveEntities 있을 때 모든 페이지 순회", async () => {
      const store = createQdrantEntityStore(mockClient);
      mockScroll
        .mockResolvedValueOnce({
          points: [{ id: pointId("Person", "Ghost1") }],
          next_page_offset: "cursor-xyz",
        })
        .mockResolvedValueOnce({
          points: [{ id: pointId("Person", "Ghost2") }],
          next_page_offset: null,
        });
      mockDelete.mockResolvedValue(undefined);

      const pruned = await store.pruneOrphans({
        userId: USER_ID,
        liveEntities: [{ type: "Person", name: "Alice" }],
      });

      expect(mockScroll).toHaveBeenCalledTimes(2);
      expect(mockScroll.mock.calls[1][1]).toMatchObject({
        offset: "cursor-xyz",
      });
      expect(pruned).toBe(2);
      expect(mockDelete).toHaveBeenCalledWith("entities", {
        wait: true,
        points: [pointId("Person", "Ghost1"), pointId("Person", "Ghost2")],
      });
    });

    it("모든 포인트가 live면 삭제 호출 안 함", async () => {
      const store = createQdrantEntityStore(mockClient);
      mockScroll.mockResolvedValueOnce({
        points: [{ id: pointId("Person", "Alice") }],
        next_page_offset: null,
      });

      const pruned = await store.pruneOrphans({
        userId: USER_ID,
        liveEntities: [{ type: "Person", name: "Alice" }],
      });

      expect(pruned).toBe(0);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("next_page_offset이 객체면 더 이상 scroll하지 않는다", async () => {
      const store = createQdrantEntityStore(mockClient);
      mockScroll.mockResolvedValueOnce({
        points: [{ id: pointId("Person", "Ghost") }],
        next_page_offset: { unknown: "object" },
      });
      mockDelete.mockResolvedValue(undefined);

      await store.pruneOrphans({
        userId: USER_ID,
        liveEntities: [{ type: "Person", name: "Alice" }],
      });

      expect(mockScroll).toHaveBeenCalledTimes(1);
    });
  });
});
