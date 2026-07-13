import { describe, expect, it } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { createSpace, listSpaces } from "./space-service";

const SOME_ERROR = { code: "XXXXX", message: "boom" };

function mockSupabase(args: {
  error?: typeof SOME_ERROR;
  row?: { id: string; public_id: string; name: string; created_at: string };
}): TypedSupabaseClient {
  const from = () => {
    const stub: Record<string, unknown> = {};
    stub["select"] = () => stub;
    stub["order"] = () =>
      Promise.resolve(
        args.error
          ? { data: null, error: args.error }
          : { data: args.row ? [args.row] : [], error: null },
      );
    return stub;
  };
  return { from } as unknown as TypedSupabaseClient;
}

describe("listSpaces", () => {
  // 사이드바·오버뷰·중복이름체크·첫진입리다이렉트 4곳이 이 함수 하나에 의존하므로
  // 실패를 삼키지 않고 그대로 던지는지가 회귀 방지의 핵심이다.
  it("조회 실패 시 SupabaseError를 그대로 던진다", async () => {
    await expect(
      listSpaces({ supabase: mockSupabase({ error: SOME_ERROR }) }),
    ).rejects.toThrow("boom");
  });

  // URL 라우팅이 publicId로 space를 찾으므로(id 대신), snake_case 컬럼이
  // camelCase 필드로 정확히 매핑되지 않으면 라우팅이 조용히 깨진다.
  it("public_id 컬럼을 publicId 필드로 매핑한다", async () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      public_id: "spc_abc123def456",
      name: "My Space",
      created_at: "2026-07-13T00:00:00.000Z",
    };
    const result = await listSpaces({ supabase: mockSupabase({ row }) });
    expect(result.spaces[0]?.publicId).toBe("spc_abc123def456");
  });
});

function mockSupabaseForCreate(): {
  supabase: TypedSupabaseClient;
  rpcParams: () => Record<string, unknown> | undefined;
} {
  let capturedParams: Record<string, unknown> | undefined;
  const from = () => {
    const stub: Record<string, unknown> = {};
    stub["select"] = () => stub;
    stub["order"] = () => stub;
    stub["limit"] = () =>
      Promise.resolve({ data: [{ workspace_id: "ws-1" }], error: null });
    return stub;
  };
  const rpc = (_fn: string, params: Record<string, unknown>) => {
    capturedParams = params;
    return Promise.resolve({ data: "space-1", error: null });
  };
  return {
    supabase: { from, rpc } as unknown as TypedSupabaseClient,
    rpcParams: () => capturedParams,
  };
}

describe("createSpace", () => {
  // publicId는 서버가 생성해 RPC로 넘기고(DB는 안 만듦), 생성 직후 FE 리다이렉트가
  // 이 값에 의존한다 — 형식이 어긋나거나 응답에서 빠지면 리다이렉트가 깨진다.
  it("spc_ 접두사 publicId를 생성해 RPC에 넘기고 응답에 포함한다", async () => {
    const { supabase, rpcParams } = mockSupabaseForCreate();
    const result = await createSpace({ supabase, name: "New Space" });

    expect(result.publicId).toMatch(/^spc_[0-9A-Za-z]{12}$/);
    expect(rpcParams()?.["p_public_id"]).toBe(result.publicId);
    expect(result.spaceId).toBe("space-1");
  });
});
