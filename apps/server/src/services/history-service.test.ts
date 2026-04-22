import { describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { listHistories } from "./history-service";

type IngestionStatus = "pending" | "completed" | "failed";
type RevisionSource = "direct" | "propagated";

type HistoryRow = {
  id: string;
  created_at: string;
  source_session_id: string | null;
};

type RevisionRow = {
  history_id: string;
  memory_id: string;
  source: RevisionSource;
  created_at: string;
};

type MemoryRow = {
  id: string;
  title: string | null;
  ingestion_status: IngestionStatus;
};

type TableRows = {
  histories?: HistoryRow[];
  memory_revisions?: RevisionRow[];
  memories?: MemoryRow[];
};

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}

function decodeCursor(cursor: string): [string, string] {
  return JSON.parse(Buffer.from(cursor, "base64url").toString()) as [
    string,
    string,
  ];
}

function mockSupabase(rows: TableRows) {
  const orCalls: Record<string, string[]> = {};

  function makeChain(table: string) {
    const tableRows = rows[table as keyof TableRows] ?? [];
    const result = { data: tableRows, error: null };
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.or = vi.fn((arg: string) => {
      orCalls[table] ??= [];
      orCalls[table].push(arg);
      return chain;
    });
    chain.then = vi.fn((resolve) => resolve(result));
    return chain;
  }

  const client = {
    from: vi.fn((table: string) => makeChain(table)),
  } as unknown as TypedSupabaseClient;

  return { client, orCalls };
}

function revision({
  historyId,
  memoryId,
  source,
  createdAt,
}: {
  historyId: string;
  memoryId: string;
  source: RevisionSource;
  createdAt: string;
}): RevisionRow {
  return {
    history_id: historyId,
    memory_id: memoryId,
    source,
    created_at: createdAt,
  };
}

function memory({
  id,
  status,
  title,
}: {
  id: string;
  status: IngestionStatus;
  title?: string | null;
}): MemoryRow {
  return {
    id,
    title: title === undefined ? `memory ${id}` : title,
    ingestion_status: status,
  };
}

describe("listHistories", () => {
  it("빈 결과면 items/nextCursor 모두 비어있음", async () => {
    const { client } = mockSupabase({});

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("결과가 limit 이하이면 nextCursor가 null", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: "s1",
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
      ],
      memories: [memory({ id: "m1", status: "completed" })],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("결과가 limit+1이면 nextCursor는 마지막 페이지 항목의 (created_at, id) 인코딩", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-03T00:00:00Z",
          source_session_id: null,
        },
        {
          id: "h2",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
        {
          id: "h3",
          created_at: "2026-03-01T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-03T00:00:00Z",
        }),
        revision({
          historyId: "h2",
          memoryId: "m2",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
        revision({
          historyId: "h3",
          memoryId: "m3",
          source: "direct",
          createdAt: "2026-03-01T00:00:00Z",
        }),
      ],
      memories: [
        memory({ id: "m1", status: "completed" }),
        memory({ id: "m2", status: "completed" }),
        memory({ id: "m3", status: "completed" }),
      ],
    });

    const page = await listHistories(client, { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(typeof page.nextCursor).toBe("string");
    const [createdAt, id] = decodeCursor(page.nextCursor as string);
    expect(createdAt).toBe("2026-03-02T00:00:00Z");
    expect(id).toBe("h2");
  });

  it("cursor가 있으면 (created_at, id) 복합 keyset 필터 적용", async () => {
    const { client, orCalls } = mockSupabase({});

    await listHistories(client, {
      limit: 20,
      cursor: encodeCursor("2026-03-01T00:00:00Z", "h-prev"),
    });

    expect(orCalls.histories).toEqual([
      "created_at.lt.2026-03-01T00:00:00Z,and(created_at.eq.2026-03-01T00:00:00Z,id.lt.h-prev)",
    ]);
  });

  it("잘못된 cursor는 BAD_REQUEST로 throw", async () => {
    const { client } = mockSupabase({});

    await expect(
      listHistories(client, { limit: 20, cursor: "not-valid" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("primaryMemory는 direct revision 중 created_at 최초 항목의 memory", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        // propagated 먼저 들어와도 direct 중 최초로 선택되어야 함
        revision({
          historyId: "h1",
          memoryId: "m-propagated",
          source: "propagated",
          createdAt: "2026-03-01T00:00:00Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m-direct-first",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m-direct-late",
          source: "direct",
          createdAt: "2026-03-02T00:00:01Z",
        }),
      ],
      memories: [
        memory({ id: "m-propagated", status: "completed" }),
        memory({ id: "m-direct-first", status: "completed", title: "첫 기억" }),
        memory({ id: "m-direct-late", status: "completed" }),
      ],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([
      {
        primaryMemory: { id: "m-direct-first", name: "첫 기억" },
        memoryCount: 3,
      },
    ]);
  });

  it("direct revision이 없는 History는 리스트에서 제외", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "propagated",
          createdAt: "2026-03-02T00:00:00Z",
        }),
      ],
      memories: [memory({ id: "m1", status: "completed" })],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toHaveLength(0);
  });

  it("revision이 하나도 없는 History(CASCADE로 모두 소실)는 제외", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [],
      memories: [],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toHaveLength(0);
  });

  it("status 집계: 하나라도 pending → processing", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m2",
          source: "propagated",
          createdAt: "2026-03-02T00:00:01Z",
        }),
      ],
      memories: [
        memory({ id: "m1", status: "pending" }),
        memory({ id: "m2", status: "completed" }),
      ],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([{ status: "processing" }]);
  });

  it("status 집계: pending 없고 failed 하나라도 있으면 failed (mixed completed/failed 포함)", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m2",
          source: "propagated",
          createdAt: "2026-03-02T00:00:01Z",
        }),
      ],
      memories: [
        memory({ id: "m1", status: "completed" }),
        memory({ id: "m2", status: "failed" }),
      ],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([{ status: "failed" }]);
  });

  it("status 집계: 모두 completed면 completed", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m2",
          source: "propagated",
          createdAt: "2026-03-02T00:00:01Z",
        }),
      ],
      memories: [
        memory({ id: "m1", status: "completed" }),
        memory({ id: "m2", status: "completed" }),
      ],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([{ status: "completed" }]);
  });

  it("memoryCount는 propagated까지 포함한 distinct memory 수", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m2",
          source: "propagated",
          createdAt: "2026-03-02T00:00:01Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m3",
          source: "propagated",
          createdAt: "2026-03-02T00:00:02Z",
        }),
        // 같은 memory의 revision이 2개여도 count는 1
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "propagated",
          createdAt: "2026-03-02T00:00:03Z",
        }),
      ],
      memories: [
        memory({ id: "m1", status: "completed" }),
        memory({ id: "m2", status: "completed" }),
        memory({ id: "m3", status: "completed" }),
      ],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([{ memoryCount: 3 }]);
  });

  it("source_session_id가 null이면 sessionId는 null로 내려감", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
      ],
      memories: [memory({ id: "m1", status: "completed" })],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([{ sessionId: null }]);
  });

  it("primaryMemory title이 null이면 fallback 라벨 사용", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        revision({
          historyId: "h1",
          memoryId: "m1",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
      ],
      memories: [memory({ id: "m1", status: "completed", title: null })],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([
      { primaryMemory: { name: "제목 없음" } },
    ]);
  });
});
