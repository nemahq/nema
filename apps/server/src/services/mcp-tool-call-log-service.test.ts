import { describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import {
  logGetSource,
  logSearch,
} from "@server/services/mcp-tool-call-log-service";

function fakeSupabase(insert: ReturnType<typeof vi.fn>): TypedSupabaseClient {
  const from = vi.fn().mockReturnValue({ insert });
  return { from } as unknown as TypedSupabaseClient;
}

describe("logSearch", () => {
  it("tool=search로 query·results를 detail에 그대로 실어 mcp_tool_calls에 적재한다", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = fakeSupabase(insert);

    await logSearch({
      supabase,
      userId: "user-1",
      detail: {
        query: "질의",
        results: [{ digestId: "digest-1", score: 0.9 }],
      },
    });

    expect(supabase.from).toHaveBeenCalledWith("mcp_tool_calls");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      tool: "search",
      detail: {
        query: "질의",
        results: [{ digestId: "digest-1", score: 0.9 }],
      },
    });
  });

  it("insert가 error를 반환해도 던지지 않는다 — 로그 실패가 도구 응답을 막으면 안 된다", async () => {
    const insert = vi
      .fn()
      .mockResolvedValue({ error: { code: "500", message: "db down" } });
    const supabase = fakeSupabase(insert);

    await expect(
      logSearch({
        supabase,
        userId: "user-1",
        detail: { query: "질의", results: [] },
      }),
    ).resolves.toBeUndefined();
  });

  it("insert 호출 자체가 예외를 던져도 전파하지 않는다", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("network down"));
    const supabase = fakeSupabase(insert);

    await expect(
      logSearch({
        supabase,
        userId: "user-1",
        detail: { query: "질의", results: [] },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("logGetSource", () => {
  it("tool=get_source로 sourceId를 detail에 실어 적재한다", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = fakeSupabase(insert);

    await logGetSource({
      supabase,
      userId: "user-1",
      detail: { sourceId: "source-1" },
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      tool: "get_source",
      detail: { sourceId: "source-1" },
    });
  });
});
