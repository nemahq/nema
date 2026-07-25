import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";

import { useSpaceNameField } from "./useSpaceNameField";

function conflictError() {
  return new TRPCClientError("Conflict", {
    result: {
      error: { code: -32009, message: "Conflict", data: { code: "CONFLICT" } },
    },
  });
}

describe("useSpaceNameField", () => {
  it("초기값은 name=initialValue, touched=false, hasConflict=false", () => {
    const { result } = renderHook(() => useSpaceNameField("스페이스"));
    expect(result.current.name).toBe("스페이스");
    expect(result.current.touched).toBe(false);
    expect(result.current.hasConflict).toBe(false);
  });

  it("initialValue를 안 주면 빈 문자열로 시작한다", () => {
    const { result } = renderHook(() => useSpaceNameField());
    expect(result.current.name).toBe("");
  });

  it("handleChange 호출 시 name이 바뀌고 touched가 true가 된다", () => {
    const { result } = renderHook(() => useSpaceNameField());

    act(() => {
      result.current.handleChange("새 이름");
    });

    expect(result.current.name).toBe("새 이름");
    expect(result.current.touched).toBe(true);
  });

  it("markConflictIfNameTaken — CONFLICT 코드의 TRPCClientError면 hasConflict가 true가 된다", () => {
    const { result } = renderHook(() => useSpaceNameField());

    act(() => {
      result.current.markConflictIfNameTaken(conflictError());
    });

    expect(result.current.hasConflict).toBe(true);
  });

  it("markConflictIfNameTaken — TRPCClientError가 아니면 무시한다", () => {
    const { result } = renderHook(() => useSpaceNameField());

    act(() => {
      result.current.markConflictIfNameTaken(new Error("network down"));
    });

    expect(result.current.hasConflict).toBe(false);
  });

  it("markConflictIfNameTaken — CONFLICT가 아닌 코드면 무시한다", () => {
    const { result } = renderHook(() => useSpaceNameField());
    const notFound = new TRPCClientError("Not found", {
      result: {
        error: {
          code: -32004,
          message: "Not found",
          data: { code: "NOT_FOUND" },
        },
      },
    });

    act(() => {
      result.current.markConflictIfNameTaken(notFound);
    });

    expect(result.current.hasConflict).toBe(false);
  });

  it("hasConflict가 true인 상태에서 handleChange를 호출하면 다시 false로 리셋된다", () => {
    const { result } = renderHook(() => useSpaceNameField());

    act(() => {
      result.current.markConflictIfNameTaken(conflictError());
    });
    expect(result.current.hasConflict).toBe(true);

    act(() => {
      result.current.handleChange("다른 이름");
    });

    expect(result.current.hasConflict).toBe(false);
  });
});
