import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { SupabaseError } from "@server/infra/supabase-error";

import { listHistories } from "./history-service";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(Sentry.captureMessage).mockClear();
});

const UUID_PREV = "11111111-1111-4111-a111-111111111111";

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

type TableErrors = Partial<
  Record<keyof TableRows, { code: string; message: string }>
>;

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}

function decodeCursor(cursor: string): [string, string] {
  return JSON.parse(Buffer.from(cursor, "base64url").toString()) as [
    string,
    string,
  ];
}

function mockSupabase(rows: TableRows, errors: TableErrors = {}) {
  const orCalls: Record<string, string[]> = {};

  function makeChain(table: string) {
    const tableRows = rows[table as keyof TableRows] ?? [];
    const tableError = errors[table as keyof TableRows] ?? null;
    const result = tableError
      ? { data: null, error: tableError }
      : { data: tableRows, error: null };
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
      cursor: encodeCursor("2026-03-01T00:00:00Z", UUID_PREV),
    });

    expect(orCalls.histories).toEqual([
      `created_at.lt.2026-03-01T00:00:00Z,and(created_at.eq.2026-03-01T00:00:00Z,id.lt.${UUID_PREV})`,
    ]);
  });

  it("JSON 파싱 실패 cursor는 BAD_REQUEST", async () => {
    const { client } = mockSupabase({});

    await expect(
      listHistories(client, { limit: 20, cursor: "not-valid" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("id가 uuid 포맷이 아닌 cursor는 BAD_REQUEST (PostgREST 문자열 주입 차단)", async () => {
    const { client } = mockSupabase({});
    const maliciousCursor = encodeCursor(
      "2026-03-01T00:00:00Z",
      "bad,and(user_id.neq.x)",
    );

    await expect(
      listHistories(client, { limit: 20, cursor: maliciousCursor }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("createdAt이 datetime이 아닌 cursor는 BAD_REQUEST", async () => {
    const { client } = mockSupabase({});
    const badCursor = encodeCursor("not-a-datetime", UUID_PREV);

    await expect(
      listHistories(client, { limit: 20, cursor: badCursor }),
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

  it("primaryMemory title이 null이면 name을 그대로 null로 전달 (fallback은 프론트 책임)", async () => {
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

    expect(page.items).toMatchObject([{ primaryMemory: { name: null } }]);
  });

  it("histories 쿼리 에러 시 SupabaseError 전파", async () => {
    const { client } = mockSupabase(
      {},
      { histories: { code: "XX500", message: "histories fail" } },
    );

    await expect(listHistories(client, { limit: 20 })).rejects.toThrow(
      SupabaseError,
    );
  });

  it("memory_revisions 쿼리 에러 시 SupabaseError 전파", async () => {
    const { client } = mockSupabase(
      {
        histories: [
          {
            id: "h1",
            created_at: "2026-03-02T00:00:00Z",
            source_session_id: null,
          },
        ],
      },
      { memory_revisions: { code: "XX500", message: "revisions fail" } },
    );

    await expect(listHistories(client, { limit: 20 })).rejects.toThrow(
      SupabaseError,
    );
  });

  it("memories 쿼리 에러 시 SupabaseError 전파", async () => {
    const { client } = mockSupabase(
      {
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
      },
      { memories: { code: "XX500", message: "memories fail" } },
    );

    await expect(listHistories(client, { limit: 20 })).rejects.toThrow(
      SupabaseError,
    );
  });

  it("복수 history의 revision이 올바르게 history_id별로 분리됨", async () => {
    const { client } = mockSupabase({
      histories: [
        {
          id: "h1",
          created_at: "2026-03-02T00:00:00Z",
          source_session_id: null,
        },
        {
          id: "h2",
          created_at: "2026-03-01T00:00:00Z",
          source_session_id: null,
        },
      ],
      memory_revisions: [
        // h1: direct m1 (completed) + propagated m2 (pending)
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
        // h2: direct m3 (failed)
        revision({
          historyId: "h2",
          memoryId: "m3",
          source: "direct",
          createdAt: "2026-03-01T00:00:00Z",
        }),
      ],
      memories: [
        memory({ id: "m1", status: "completed", title: "h1 primary" }),
        memory({ id: "m2", status: "pending" }),
        memory({ id: "m3", status: "failed", title: "h2 primary" }),
      ],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([
      {
        id: "h1",
        primaryMemory: { id: "m1", name: "h1 primary" },
        memoryCount: 2,
        status: "processing",
      },
      {
        id: "h2",
        primaryMemory: { id: "m3", name: "h2 primary" },
        memoryCount: 1,
        status: "failed",
      },
    ]);
  });

  it("primaryMemory가 memoryMap에서 누락되면 Sentry.captureMessage로 경고 + 해당 행 제외", async () => {
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
          memoryId: "m-missing",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
      ],
      // m-missing에 대한 memories row 없음 (FK/RLS 무결성 이상 시나리오)
      memories: [],
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toHaveLength(0);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("primary memory missing"),
      expect.objectContaining({
        level: "warning",
        extra: expect.objectContaining({
          historyId: "h1",
          memoryId: "m-missing",
        }),
      }),
    );
  });

  it("propagated memory가 memoryMap에서 누락되면 status를 processing으로 보수 판정 + Sentry 경고", async () => {
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
          memoryId: "m-primary",
          source: "direct",
          createdAt: "2026-03-02T00:00:00Z",
        }),
        revision({
          historyId: "h1",
          memoryId: "m-missing-propagated",
          source: "propagated",
          createdAt: "2026-03-02T00:00:01Z",
        }),
      ],
      memories: [memory({ id: "m-primary", status: "completed" })],
      // m-missing-propagated는 memories에 없음 → status 알 수 없음
    });

    const page = await listHistories(client, { limit: 20 });

    expect(page.items).toMatchObject([
      { memoryCount: 2, status: "processing" },
    ]);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("revision memories missing"),
      expect.objectContaining({
        level: "warning",
        extra: expect.objectContaining({
          historyId: "h1",
          missingMemoryIds: ["m-missing-propagated"],
        }),
      }),
    );
  });
});
