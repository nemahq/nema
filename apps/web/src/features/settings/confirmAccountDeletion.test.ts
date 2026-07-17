import { describe, expect, it } from "vitest";
import { TRPCClientError } from "@trpc/client";

import {
  canConfirmAccountDeletion,
  isPreconditionFailed,
  resolveConfirmationTarget,
} from "./confirmAccountDeletion";

function trpcErrorWithCode(code: string) {
  return new TRPCClientError(code, {
    result: { error: { code: -32000, message: code, data: { code } } },
  });
}

describe("isPreconditionFailed", () => {
  it("PRECONDITION_FAILED 코드의 TRPCClientError면 true", () => {
    expect(isPreconditionFailed(trpcErrorWithCode("PRECONDITION_FAILED"))).toBe(
      true,
    );
  });

  it("다른 코드의 TRPCClientError면 false", () => {
    expect(
      isPreconditionFailed(trpcErrorWithCode("INTERNAL_SERVER_ERROR")),
    ).toBe(false);
  });

  it("TRPCClientError가 아니면 false", () => {
    expect(isPreconditionFailed(new Error("boom"))).toBe(false);
    expect(isPreconditionFailed(undefined)).toBe(false);
  });
});

describe("resolveConfirmationTarget", () => {
  it("이메일이 있으면 이메일을 확인 대상으로 쓴다", () => {
    expect(resolveConfirmationTarget("kyle@getnema.app", "Kyle")).toBe(
      "kyle@getnema.app",
    );
  });

  it("이메일이 빈 문자열이면 표시 이름으로 대체한다", () => {
    expect(resolveConfirmationTarget("", "Kyle")).toBe("Kyle");
  });

  it("이메일이 공백뿐이면 표시 이름으로 대체한다", () => {
    expect(resolveConfirmationTarget("   ", "Kyle")).toBe("Kyle");
  });
});

describe("canConfirmAccountDeletion", () => {
  it("입력값이 확인 대상과 일치하면 true", () => {
    expect(
      canConfirmAccountDeletion("kyle@getnema.app", "kyle@getnema.app"),
    ).toBe(true);
  });

  it("대소문자가 달라도 일치로 본다", () => {
    expect(
      canConfirmAccountDeletion("Kyle@GetNema.app", "kyle@getnema.app"),
    ).toBe(true);
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(
      canConfirmAccountDeletion("  kyle@getnema.app  ", "kyle@getnema.app"),
    ).toBe(true);
  });

  it("입력값이 다르면 false", () => {
    expect(
      canConfirmAccountDeletion("wrong@getnema.app", "kyle@getnema.app"),
    ).toBe(false);
  });

  it("확인 대상이 빈 문자열이면 입력값이 비어 있어도 항상 false다", () => {
    expect(canConfirmAccountDeletion("", "")).toBe(false);
  });
});
