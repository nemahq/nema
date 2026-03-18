import { describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { SupabaseError } from "@server/infra/supabase-error";

import { createSession, deleteSession, listSessions } from "./session-service";

function makeRow(id: string, updatedAt: string) {
  return {
    id,
    title: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: updatedAt,
  };
}

function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify([updatedAt, id])).toString("base64url");
}

function decodeCursor(cursor: string): [string, string] {
  return JSON.parse(Buffer.from(cursor, "base64url").toString()) as [
    string,
    string,
  ];
}

function mockSupabase(resolved: {
  data?: unknown;
  error?: unknown;
  count?: number;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockResolvedValue(resolved);

  chain.then = vi.fn((resolve) => resolve(resolved));

  return {
    client: {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as TypedSupabaseClient,
    chain,
  };
}

describe("listSessions", () => {
  it("결과가 limit 이하이면 nextCursor가 null", async () => {
    const rows = [
      makeRow("a", "2026-03-02T00:00:00Z"),
      makeRow("b", "2026-03-01T00:00:00Z"),
    ];
    const { client } = mockSupabase({ data: rows });

    const page = await listSessions(client, { limit: 5 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("결과가 limit+1이면 nextCursor가 마지막 항목의 (updatedAt, id) 인코딩", async () => {
    const rows = [
      makeRow("a", "2026-03-03T00:00:00Z"),
      makeRow("b", "2026-03-02T00:00:00Z"),
      makeRow("c", "2026-03-01T00:00:00Z"),
    ];
    const { client } = mockSupabase({ data: rows });

    const page = await listSessions(client, { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTypeOf("string");
    const [updatedAt, id] = decodeCursor(page.nextCursor as string);
    expect(updatedAt).toBe("2026-03-02T00:00:00Z");
    expect(id).toBe("b");
  });

  it("cursor가 있으면 or 필터로 복합 커서 적용", async () => {
    const { client, chain } = mockSupabase({ data: [] });
    const cursor = encodeCursor("2026-03-01T00:00:00Z", "some-id");

    await listSessions(client, { limit: 20, cursor });

    expect(chain.or).toHaveBeenCalledWith(
      "updated_at.lt.2026-03-01T00:00:00Z,and(updated_at.eq.2026-03-01T00:00:00Z,id.lt.some-id)",
    );
  });

  it("쿼리 실패 시 SupabaseError(query_failed) throw", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "fail" } });

    await expect(listSessions(client, { limit: 20 })).rejects.toThrow(
      SupabaseError,
    );
  });
});

describe("createSession", () => {
  it("생성된 세션을 camelCase로 변환하여 반환", async () => {
    const row = makeRow("new-id", "2026-03-10T00:00:00Z");
    const { client } = mockSupabase({ data: row });

    const session = await createSession(client, {
      userId: "user-1",
      sessionId: "new-id",
    });

    expect(session).toEqual({
      id: "new-id",
      title: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-03-10T00:00:00Z",
    });
  });

  it("쿼리 실패 시 SupabaseError(query_failed) throw", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "fail" } });

    await expect(
      createSession(client, { userId: "user-1", sessionId: "new-id" }),
    ).rejects.toThrow(SupabaseError);
  });
});

describe("deleteSession", () => {
  it("삭제 성공 시 정상 반환", async () => {
    const { client } = mockSupabase({ error: null, count: 1 });

    await expect(
      deleteSession(client, { sessionId: "session-1" }),
    ).resolves.toBeUndefined();
  });

  it("count가 0이면 SupabaseError(not_found) throw", async () => {
    const { client } = mockSupabase({ error: null, count: 0 });

    await expect(
      deleteSession(client, { sessionId: "session-1" }),
    ).rejects.toThrow(expect.objectContaining({ code: "not_found" }));
  });

  it("쿼리 실패 시 SupabaseError(query_failed) throw", async () => {
    const { client } = mockSupabase({
      error: { message: "fail" },
    });

    await expect(
      deleteSession(client, { sessionId: "session-1" }),
    ).rejects.toThrow(expect.objectContaining({ code: "query_failed" }));
  });
});
