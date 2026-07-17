import { describe, expect, it } from "vitest";
import { TRPCClientError } from "@trpc/client";

import { isPreconditionFailed } from "./accountErrors";

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
