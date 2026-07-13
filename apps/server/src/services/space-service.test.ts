import { describe, expect, it } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { listSpaces } from "./space-service";

const SOME_ERROR = { code: "XXXXX", message: "boom" };

function mockSupabase(args: {
  error?: typeof SOME_ERROR;
}): TypedSupabaseClient {
  const from = () => {
    const stub: Record<string, unknown> = {};
    stub["select"] = () => stub;
    stub["order"] = () =>
      Promise.resolve(
        args.error
          ? { data: null, error: args.error }
          : { data: [], error: null },
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
});
