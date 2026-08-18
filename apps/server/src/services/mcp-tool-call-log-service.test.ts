import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseAdminMock, insertSpy, fromSpy, captureExceptionMock } =
  vi.hoisted(() => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const fromSpy = vi.fn().mockReturnValue({ insert: insertSpy });
    return {
      insertSpy,
      fromSpy,
      getSupabaseAdminMock: vi.fn(() => ({ from: fromSpy })),
      captureExceptionMock: vi.fn(),
    };
  });
vi.mock("@server/infra/supabase/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));
vi.mock("@server/infra/monitoring", () => ({
  captureException: captureExceptionMock,
}));

import {
  logGetSource,
  logSearch,
} from "@server/services/mcp-tool-call-log-service";

describe("logSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockResolvedValue({ error: null });
  });

  it("insert가 error를 반환하면 tool·userId를 태그로 Sentry에 보고한다 — 물어본 횟수가 로그 실패로 0이 되는 걸 놓치지 않게", async () => {
    insertSpy.mockResolvedValueOnce({
      error: { code: "500", message: "db down" },
    });

    await logSearch({
      userId: "user-1",
      detail: { query: "질의", results: [] },
    });

    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
      tags: { tool: "search_digests", userId: "user-1" },
    });
  });

  it("insert 호출 자체가 예외를 던지면 tool·userId를 태그로 Sentry에 보고한다", async () => {
    const thrown = new Error("network down");
    insertSpy.mockRejectedValueOnce(thrown);

    await logSearch({
      userId: "user-1",
      detail: { query: "질의", results: [] },
    });

    expect(captureExceptionMock).toHaveBeenCalledWith(thrown, {
      tags: { tool: "search_digests", userId: "user-1" },
    });
  });

  it("tool=search_digests로 query·results를 detail에 그대로 실어 admin 클라이언트로 적재한다", async () => {
    await logSearch({
      userId: "user-1",
      detail: {
        query: "질의",
        results: [{ digestId: "digest-1", score: 0.9 }],
      },
    });

    expect(fromSpy).toHaveBeenCalledWith("mcp_tool_calls");
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      tool: "search_digests",
      detail: {
        query: "질의",
        results: [{ digestId: "digest-1", score: 0.9 }],
      },
    });
  });

  it("insert가 error를 반환해도 던지지 않는다 — 로그 실패가 도구 응답을 막으면 안 된다", async () => {
    insertSpy.mockResolvedValueOnce({
      error: { code: "500", message: "db down" },
    });

    await expect(
      logSearch({
        userId: "user-1",
        detail: { query: "질의", results: [] },
      }),
    ).resolves.toBeUndefined();
  });

  it("insert 호출 자체가 예외를 던져도 전파하지 않는다", async () => {
    insertSpy.mockRejectedValueOnce(new Error("network down"));

    await expect(
      logSearch({
        userId: "user-1",
        detail: { query: "질의", results: [] },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("logGetSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockResolvedValue({ error: null });
  });

  it("tool=get_source로 sourceId를 detail에 실어 적재한다", async () => {
    await logGetSource({
      userId: "user-1",
      detail: { sourceId: "source-1" },
    });

    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      tool: "get_source",
      detail: { sourceId: "source-1" },
    });
  });
});
