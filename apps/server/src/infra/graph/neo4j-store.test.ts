import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";

import { GraphStoreError } from "./graph-store";

vi.mock("@sentry/node", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

const mockRun = vi.fn();
const mockClose = vi.fn();
const mockExecuteWrite = vi.fn();
const mockSessionClose = vi.fn();

const { MockInteger } = vi.hoisted(() => {
  class MockInteger {
    low: number;
    high = 0;
    constructor(low: number) {
      this.low = low;
    }
    toNumber() {
      return this.low;
    }
  }
  return { MockInteger };
});

vi.mock("neo4j-driver", () => {
  const intFn = (v: number) => new MockInteger(v);
  return {
    default: {
      driver: vi.fn(() => ({
        session: () => ({
          run: mockRun,
          executeWrite: mockExecuteWrite,
          close: mockSessionClose,
        }),
        close: mockClose,
      })),
      auth: { basic: vi.fn() },
      int: intFn,
    },
    Integer: MockInteger,
    isInt: (v: unknown) => v instanceof MockInteger,
  };
});

vi.mock("@server/env", () => ({
  getEnv: vi.fn(() => ({
    NEO4J_URI: "bolt://mock-neo4j",
    NEO4J_USERNAME: "mock-user",
    NEO4J_PASSWORD: "mock-password",
  })),
}));

import { createNeo4jStore } from "./neo4j-store";

describe("createNeo4jStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteWrite.mockImplementation(
      async (fn: (tx: { run: typeof mockRun }) => Promise<void>) => {
        await fn({ run: mockRun });
      },
    );
  });

  describe("ensureSchema", () => {
    it("creates constraint on (type, nameEn, userId) and indexes, runs backfill", async () => {
      const zeroBackfill = {
        records: [
          {
            get: (key: string) =>
              key === "updated" ? new MockInteger(0) : null,
          },
        ],
      };
      mockRun
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce(zeroBackfill);
      const store = createNeo4jStore();
      await store.ensureSchema();
      expect(mockRun).toHaveBeenCalledTimes(5);
      expect(mockRun.mock.calls[0][0]).toContain(
        "DROP CONSTRAINT entity_unique",
      );
      expect(mockRun.mock.calls[1][0]).toContain("entity_unique_en");
      expect(mockRun.mock.calls[1][0]).toContain(
        "(e.type, e.nameEn, e.userId)",
      );
      expect(mockRun.mock.calls[2][0]).toContain("entity_user_id");
      expect(mockRun.mock.calls[3][0]).toContain("document_doc_id");
      expect(mockRun.mock.calls[4][0]).toContain("e.nameEn IS NULL");
      expect(mockRun.mock.calls[4][0]).toContain("SET e.nameEn = e.name");
      expect(mockSessionClose).toHaveBeenCalled();
    });

    it("reports to Sentry when backfill touched rows", async () => {
      const backfillWithUpdates = {
        records: [
          {
            get: (key: string) =>
              key === "updated" ? new MockInteger(12) : null,
          },
        ],
      };
      mockRun
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce(backfillWithUpdates);
      const store = createNeo4jStore();
      await store.ensureSchema();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("backfilled Entity.nameEn"),
        expect.objectContaining({
          level: "info",
          extra: { backfilled: 12 },
        }),
      );
    });

    it("throws GraphStoreError on failure", async () => {
      mockRun.mockRejectedValue(new Error("connection refused"));
      const store = createNeo4jStore();
      await expect(store.ensureSchema()).rejects.toThrow(GraphStoreError);
      expect(mockSessionClose).toHaveBeenCalled();
    });
  });

  describe("upsertEntities", () => {
    it("writes Document node only for empty entities (lastReferencedAt 집계 보존)", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.upsertEntities({
        docId: "d1",
        userId: "u1",
        entities: [],
        createdAt: "2026-04-01T00:00:00.000Z",
      });
      expect(mockExecuteWrite).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalledTimes(1);
      expect(mockRun.mock.calls[0][0]).toContain("MERGE (d:Document");
      expect(mockRun.mock.calls[0][0]).toContain(
        "ON CREATE SET d.createdAt = $createdAt",
      );
      expect(mockRun.mock.calls[0][1]).toEqual({
        docId: "d1",
        createdAt: "2026-04-01T00:00:00.000Z",
      });
    });

    it("rejects blank entity nameEn", async () => {
      const store = createNeo4jStore();
      await expect(
        store.upsertEntities({
          docId: "d1",
          userId: "u1",
          entities: [{ type: "Person", name: "김철수", nameEn: "  " }],
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      ).rejects.toThrow(GraphStoreError);
      expect(mockExecuteWrite).not.toHaveBeenCalled();
    });

    it("merges document, entities, and edges with nameEn as merge key", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.upsertEntities({
        docId: "d1",
        userId: "u1",
        entities: [
          { type: "Person", name: "김철수", nameEn: "Kim Chulsu" },
          { type: "Topic", name: "프론트엔드", nameEn: "frontend" },
        ],
        createdAt: "2026-04-01T00:00:00.000Z",
      });

      expect(mockRun).toHaveBeenCalledTimes(3);
      expect(mockRun.mock.calls[0][0]).toContain("ON CREATE SET d.createdAt");
      expect(mockRun.mock.calls[1][0]).toContain("UNWIND");
      expect(mockRun.mock.calls[1][0]).toContain(
        "MERGE (e:Entity {type: entity.type, nameEn: entity.nameEn",
      );
      expect(mockRun.mock.calls[1][0]).toContain(
        "ON CREATE SET e.name = entity.name",
      );
      expect(mockRun.mock.calls[1][1]).toEqual(
        expect.objectContaining({
          entities: [
            { type: "Person", name: "김철수", nameEn: "Kim Chulsu" },
            { type: "Topic", name: "프론트엔드", nameEn: "frontend" },
          ],
        }),
      );
      expect(mockRun.mock.calls[2][0]).toContain("RELATED_TO");
    });

    it("skips RELATED_TO for single entity", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.upsertEntities({
        docId: "d1",
        userId: "u1",
        entities: [{ type: "Person", name: "김철수", nameEn: "Kim Chulsu" }],
        createdAt: "2026-04-01T00:00:00.000Z",
      });

      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    it("wraps errors in GraphStoreError", async () => {
      mockRun.mockRejectedValue(new Error("write failed"));
      const store = createNeo4jStore();
      await expect(
        store.upsertEntities({
          docId: "d1",
          userId: "u1",
          entities: [{ type: "Person", name: "김철수", nameEn: "Kim Chulsu" }],
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      ).rejects.toThrow(GraphStoreError);
      expect(mockSessionClose).toHaveBeenCalled();
    });
  });

  describe("findRelatedDocuments", () => {
    it("returns related documents sorted by shared entity count", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: (key: string) => (key === "docId" ? "d2" : new MockInteger(3)),
          },
          {
            get: (key: string) => (key === "docId" ? "d3" : new MockInteger(1)),
          },
        ],
      });
      const store = createNeo4jStore();
      const results = await store.findRelatedDocuments({
        docId: "d1",
        userId: "u1",
      });

      expect(results).toEqual([
        { docId: "d2", sharedEntityCount: 3 },
        { docId: "d3", sharedEntityCount: 1 },
      ]);
    });

    it("accumulates scores across multiple hops", async () => {
      const hop1Record = {
        get: (key: string) => (key === "docId" ? "d2" : new MockInteger(2)),
      };
      const hop2Record = {
        get: (key: string) => (key === "docId" ? "d3" : new MockInteger(1)),
      };
      mockRun
        .mockResolvedValueOnce({ records: [hop1Record] })
        .mockResolvedValueOnce({ records: [hop2Record] });

      const store = createNeo4jStore();
      const results = await store.findRelatedDocuments({
        docId: "d1",
        userId: "u1",
        depth: 2,
      });

      expect(mockRun).toHaveBeenCalledTimes(2);
      expect(mockRun.mock.calls[1][1].frontier).toEqual(["d2"]);
      expect(mockRun.mock.calls[1][1].visited).toEqual(
        expect.arrayContaining(["d1", "d2"]),
      );
      expect(results).toEqual([
        { docId: "d2", sharedEntityCount: 2 },
        { docId: "d3", sharedEntityCount: 1 },
      ]);
    });

    it("stops early when frontier is empty", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.findRelatedDocuments({
        docId: "d1",
        userId: "u1",
        depth: 3,
      });
      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it("respects limit parameter", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: (key: string) => (key === "docId" ? "d2" : new MockInteger(3)),
          },
          {
            get: (key: string) => (key === "docId" ? "d3" : new MockInteger(1)),
          },
        ],
      });
      const store = createNeo4jStore();
      const results = await store.findRelatedDocuments({
        docId: "d1",
        userId: "u1",
        limit: 1,
      });
      expect(results).toHaveLength(1);
      expect(results[0].docId).toBe("d2");
    });

    it("returns empty array when no related documents", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      const results = await store.findRelatedDocuments({
        docId: "d1",
        userId: "u1",
      });
      expect(results).toEqual([]);
    });

    it("wraps errors in GraphStoreError", async () => {
      mockRun.mockRejectedValue(new Error("query failed"));
      const store = createNeo4jStore();
      await expect(
        store.findRelatedDocuments({ docId: "d1", userId: "u1" }),
      ).rejects.toThrow(GraphStoreError);
    });

    it("throws GraphStoreError when record contains non-string docId", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: (key: string) => (key === "docId" ? 123 : new MockInteger(1)),
          },
        ],
      });
      const store = createNeo4jStore();
      await expect(
        store.findRelatedDocuments({ docId: "d1", userId: "u1" }),
      ).rejects.toThrow(GraphStoreError);
    });

    it("throws GraphStoreError when record contains non-Integer sharedEntityCount", async () => {
      mockRun.mockResolvedValue({
        records: [
          { get: (key: string) => (key === "docId" ? "d2" : "not-integer") },
        ],
      });
      const store = createNeo4jStore();
      await expect(
        store.findRelatedDocuments({ docId: "d1", userId: "u1" }),
      ).rejects.toThrow(GraphStoreError);
    });
  });

  describe("findDocumentsByEntities", () => {
    it("returns empty for empty entity names", async () => {
      const store = createNeo4jStore();
      const results = await store.findDocumentsByEntities({
        entityNamesEn: [],
        userId: "u1",
      });
      expect(results).toEqual([]);
      expect(mockRun).not.toHaveBeenCalled();
    });

    it("searches by English entity names", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: (key: string) => (key === "docId" ? "d1" : new MockInteger(2)),
          },
        ],
      });
      const store = createNeo4jStore();
      const results = await store.findDocumentsByEntities({
        entityNamesEn: ["Kim Chulsu", "frontend"],
        userId: "u1",
      });

      expect(results).toEqual([{ docId: "d1", sharedEntityCount: 2 }]);
      expect(mockRun.mock.calls[0][0]).toContain("e.nameEn IN $entityNamesEn");
      expect(mockRun.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          entityNamesEn: ["Kim Chulsu", "frontend"],
          userId: "u1",
        }),
      );
    });
  });

  describe("listEntities", () => {
    it("returns entities for user", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              if (key === "type") {
                return "Person";
              }
              if (key === "nameEn") {
                return "Kim Chulsu";
              }
              return "김철수";
            },
          },
        ],
      });
      const store = createNeo4jStore();
      const results = await store.listEntities({ userId: "u1" });
      expect(results).toEqual([
        { type: "Person", name: "김철수", nameEn: "Kim Chulsu" },
      ]);
    });

    it("includes type filter when provided", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.listEntities({ userId: "u1", type: "Person" });
      expect(mockRun.mock.calls[0][0]).toContain("e.type = $type");
    });

    it("omits type filter when not provided", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.listEntities({ userId: "u1" });
      expect(mockRun.mock.calls[0][0]).not.toContain("e.type = $type");
    });

    it("throws GraphStoreError when record contains invalid entity type", async () => {
      mockRun.mockResolvedValue({
        records: [
          { get: (key: string) => (key === "type" ? "InvalidType" : "name") },
        ],
      });
      const store = createNeo4jStore();
      await expect(store.listEntities({ userId: "u1" })).rejects.toThrow(
        GraphStoreError,
      );
    });
  });

  describe("listEntitiesWithStats", () => {
    it("aggregates lastReferencedAt via max(d.createdAt) and orders NULLs last", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.listEntitiesWithStats({ userId: "u1" });
      const cypher = mockRun.mock.calls[0][0] as string;
      expect(cypher).toContain("max(d.createdAt) AS lastReferencedAt");
      expect(cypher).toContain(
        "ORDER BY lastReferencedAt IS NULL, lastReferencedAt DESC",
      );
    });

    it("returns nameEn and lastReferencedAt, falling back to name when nameEn is null", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              if (key === "type") {
                return "Topic";
              }
              if (key === "name") {
                return "AI Marketing";
              }
              if (key === "nameEn") {
                return null;
              }
              if (key === "documentCount") {
                return new MockInteger(5);
              }
              if (key === "lastReferencedAt") {
                return "2026-04-10T00:00:00.000Z";
              }
              return null;
            },
          },
        ],
      });
      const store = createNeo4jStore();
      const results = await store.listEntitiesWithStats({ userId: "u1" });
      expect(results).toEqual([
        {
          type: "Topic",
          name: "AI Marketing",
          nameEn: "AI Marketing",
          documentCount: 5,
          lastReferencedAt: "2026-04-10T00:00:00.000Z",
        },
      ]);
    });

    it("handles entities with no connected documents (lastReferencedAt undefined)", async () => {
      mockRun.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              if (key === "type") {
                return "Person";
              }
              if (key === "name") {
                return "Kyle";
              }
              if (key === "nameEn") {
                return "Kyle";
              }
              if (key === "documentCount") {
                return new MockInteger(0);
              }
              if (key === "lastReferencedAt") {
                return null;
              }
              return null;
            },
          },
        ],
      });
      const store = createNeo4jStore();
      const results = await store.listEntitiesWithStats({ userId: "u1" });
      expect(results[0]?.lastReferencedAt).toBeUndefined();
    });
  });

  describe("mergeEntities", () => {
    it("skips for empty source names", async () => {
      const store = createNeo4jStore();
      await store.mergeEntities({
        userId: "u1",
        targetNameEn: "Kim Chulsu",
        sourceNamesEn: [],
        type: "Person",
      });
      expect(mockExecuteWrite).not.toHaveBeenCalled();
    });

    it("runs three queries in transaction", async () => {
      mockRun.mockResolvedValue({ records: [] });
      const store = createNeo4jStore();
      await store.mergeEntities({
        userId: "u1",
        targetNameEn: "Kim Chulsu",
        sourceNamesEn: ["Chulsu"],
        type: "Person",
      });

      expect(mockRun).toHaveBeenCalledTimes(3);
      expect(mockRun.mock.calls[0][0]).toContain("MENTIONED_IN");
      expect(mockRun.mock.calls[0][0]).toContain("nameEn: $targetNameEn");
      expect(mockRun.mock.calls[1][0]).toContain("RELATED_TO");
      expect(mockRun.mock.calls[2][0]).toContain("DETACH DELETE");
    });

    it("wraps errors in GraphStoreError", async () => {
      mockRun.mockRejectedValue(new Error("merge failed"));
      const store = createNeo4jStore();
      await expect(
        store.mergeEntities({
          userId: "u1",
          targetNameEn: "Kim Chulsu",
          sourceNamesEn: ["Chulsu"],
          type: "Person",
        }),
      ).rejects.toThrow(GraphStoreError);
    });
  });

  describe("deleteByDocument", () => {
    it("collects candidates, deletes document, then cleans orphans", async () => {
      mockRun
        .mockResolvedValueOnce({ records: [{ get: () => ["id-1", "id-2"] }] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] });
      const store = createNeo4jStore();
      await store.deleteByDocument("d1");

      // Step 1: collect candidate orphan entity ids
      expect(mockRun.mock.calls[0][0]).toContain("collect(id(e))");
      expect(mockRun.mock.calls[0][1]).toEqual({ docId: "d1" });

      // Step 2: delete the document node
      expect(mockRun.mock.calls[1][0]).toContain("DETACH DELETE d");
      expect(mockRun.mock.calls[1][1]).toEqual({ docId: "d1" });

      // Step 3: delete orphan entities
      expect(mockRun.mock.calls[2][0]).toContain("DETACH DELETE e");
      expect(mockRun.mock.calls[2][1]).toEqual({ ids: ["id-1", "id-2"] });
    });

    it("skips orphan cleanup when no candidates", async () => {
      mockRun
        .mockResolvedValueOnce({ records: [{ get: () => [] }] })
        .mockResolvedValueOnce({ records: [] });
      const store = createNeo4jStore();
      await store.deleteByDocument("d1");

      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    it("wraps errors in GraphStoreError", async () => {
      mockRun.mockRejectedValue(new Error("delete failed"));
      const store = createNeo4jStore();
      await expect(store.deleteByDocument("d1")).rejects.toThrow(
        GraphStoreError,
      );
    });
  });
});
