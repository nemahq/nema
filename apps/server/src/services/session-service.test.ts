import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseError } from "../infra/supabase-error";
import { createSession, deleteSession, listSessions } from "./session-service";

function makeRow(id: string, updatedAt: string) {
  return {
    id,
    title: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: updatedAt,
  };
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
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockResolvedValue(resolved);

  chain.then = vi.fn((resolve) => resolve(resolved));

  return {
    client: {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as SupabaseClient,
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

    const result = await listSessions(client, { limit: 5 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("결과가 limit+1이면 nextCursor가 마지막 항목의 updatedAt", async () => {
    const rows = [
      makeRow("a", "2026-03-03T00:00:00Z"),
      makeRow("b", "2026-03-02T00:00:00Z"),
      makeRow("c", "2026-03-01T00:00:00Z"),
    ];
    const { client } = mockSupabase({ data: rows });

    const result = await listSessions(client, { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe("2026-03-02T00:00:00Z");
  });

  it("cursor가 있으면 lt 필터 적용", async () => {
    const { client, chain } = mockSupabase({ data: [] });

    await listSessions(client, { limit: 20, cursor: "2026-03-01T00:00:00Z" });

    expect(chain.lt).toHaveBeenCalledWith("updated_at", "2026-03-01T00:00:00Z");
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

    const result = await createSession(client, "user-1");

    expect(result).toEqual({
      id: "new-id",
      title: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-03-10T00:00:00Z",
    });
  });

  it("쿼리 실패 시 SupabaseError(query_failed) throw", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "fail" } });

    await expect(createSession(client, "user-1")).rejects.toThrow(
      SupabaseError,
    );
  });
});

describe("deleteSession", () => {
  it("삭제 성공 시 정상 반환", async () => {
    const { client } = mockSupabase({ error: null, count: 1 });

    await expect(deleteSession(client, "session-1")).resolves.toBeUndefined();
  });

  it("count가 0이면 SupabaseError(not_found) throw", async () => {
    const { client } = mockSupabase({ error: null, count: 0 });

    await expect(deleteSession(client, "session-1")).rejects.toThrow(
      expect.objectContaining({ code: "not_found" }),
    );
  });

  it("쿼리 실패 시 SupabaseError(query_failed) throw", async () => {
    const { client } = mockSupabase({
      error: { message: "fail" },
      count: null,
    });

    await expect(deleteSession(client, "session-1")).rejects.toThrow(
      expect.objectContaining({ code: "query_failed" }),
    );
  });
});
