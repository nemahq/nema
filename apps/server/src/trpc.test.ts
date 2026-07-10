import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";

import { SupabaseError } from "./infra/supabase-error";
import { onTRPCError } from "./trpc";

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

// 미들웨어 try/catch가 tRPC 내부 구조상 resolver 에러를 절대 못 잡는다는 걸 모르고
// 짠 코드였다 — 이 테스트가 없었다면 그 죽은 코드 사고가 onTRPCError에서도 조용히
// 재발할 수 있었다(trpc.ts 상단 코멘트 참고).
describe("onTRPCError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cause 없이 앱 코드가 직접 던진 TRPCError(UNAUTHORIZED)는 캡처하지 않는다", () => {
    onTRPCError({
      error: new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      }),
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("zod 입력 검증 실패(BAD_REQUEST, cause는 도메인 타입이 아님)는 캡처하지 않는다", () => {
    onTRPCError({
      error: new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid input",
        cause: new Error("zod validation error"),
      }),
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("EXPECTED_DOMAIN_CODES에 속하는 도메인 에러(이름 중복)는 캡처하지 않는다", () => {
    const cause = new SupabaseError("space_name_conflict", "dup");
    onTRPCError({
      error: new TRPCError({ code: "CONFLICT", message: "dup", cause }),
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("EXPECTED_DOMAIN_CODES 밖의 도메인 에러(query_failed)는 캡처한다", () => {
    const cause = new SupabaseError("query_failed", "boom");
    onTRPCError({
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "boom",
        cause,
      }),
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      cause,
      expect.objectContaining({ tags: { domainCode: "DB_QUERY_FAILED" } }),
    );
  });

  it("앱 코드가 의도적으로 INTERNAL_SERVER_ERROR로 던진 에러(cause는 도메인 타입 아님)는 캡처한다", () => {
    const cause = new Error("auth api down");
    onTRPCError({
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete account.",
        cause,
      }),
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      cause,
      expect.objectContaining({ tags: { domainCode: "UNKNOWN" } }),
    );
  });

  it("tRPC가 원시 에러를 자동으로 감싼 경우(cause 있는 INTERNAL_SERVER_ERROR)도 캡처한다", () => {
    const cause = new Error("no workspace membership");
    onTRPCError({
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: cause.message,
        cause,
      }),
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      cause,
      expect.anything(),
    );
  });
});
