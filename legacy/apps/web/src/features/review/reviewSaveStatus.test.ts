import { describe, expect, it, vi } from "vitest";
import { TRPCClientError } from "@trpc/client";

// getErrorMessage(경유)가 실제 tolgee 클라이언트를 불러오면 VITE_* 환경변수 검증이
// 테스트 환경에서 죽는다 — 이 테스트는 분류 로직만 보므로 t()만 흉내낸 스텁으로 대체한다.
vi.mock("@web/lib/tolgee/client", () => ({
  tolgee: { t: (key: string) => key },
}));

import { classifyReviewSaveError } from "./reviewSaveStatus";

function trpcErrorWithCode(code: string, message: string) {
  return new TRPCClientError(message, {
    result: { error: { code: -32000, message, data: { code } } },
  });
}

describe("classifyReviewSaveError", () => {
  it("CONFLICT 코드면 conflict — 서버가 실어 보낸 새로고침 안내 문구를 그대로 쓴다", () => {
    const message =
      "그 사이 다른 곳에서 이미 저장했어요. 새로고침해서 최신 내용을 확인해주세요.";

    expect(
      classifyReviewSaveError(trpcErrorWithCode("CONFLICT", message)),
    ).toEqual({ kind: "conflict", message });
  });

  it("CONFLICT가 아닌 tRPC 에러는 conflict와 구분되는 error로 분류한다", () => {
    const status = classifyReviewSaveError(
      trpcErrorWithCode("BAD_REQUEST", "잘못된 요청이에요."),
    );

    expect(status.kind).toBe("error");
  });

  it("tRPC 에러가 아닌 값도 error로 분류한다(방어적 처리)", () => {
    expect(classifyReviewSaveError(new Error("network down")).kind).toBe(
      "error",
    );
  });
});
