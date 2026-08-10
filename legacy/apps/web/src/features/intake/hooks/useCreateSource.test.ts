import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { getRecordEntry, setRecordEntry } from "@web/utils/localStorage";

interface MockMutationOptions {
  onMutate: (v: { spaceId?: string; body: string }) => void;
  onError: (e: unknown, v: { spaceId?: string; body: string }) => void;
  onSuccess: (d: unknown, v: { spaceId?: string; body: string }) => void;
}
type MockUseMutation = (
  procedure: unknown,
  options: MockMutationOptions,
) => {
  mutate: () => void;
  mutateAsync: () => void;
  isPending: boolean;
  isPendingAfterDelay: boolean;
};

// 이 훅이 넘기는 useMutation 옵션(onMutate/onError/onSuccess)을 그대로 가로채,
// 언마운트 여부와 무관하게 mutate() 콜백이 아니라 훅 옵션 레벨에서 저장소를
// 다루는지 직접 검증한다 — 실제 tRPC 클라이언트·QueryClient는 필요하지 않다.
const useMutationMock = vi.fn<MockUseMutation>(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isPendingAfterDelay: false,
}));
vi.mock("@web/lib/tanstack-query", () => ({
  useMutation: (procedure: unknown, options: MockMutationOptions) =>
    useMutationMock(procedure, options),
}));

const invalidateMock = vi.fn();
vi.mock("@web/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      source: { listPending: { invalidate: invalidateMock } },
    }),
    // getMutationKey(trpc.source.create)(useIsCreatingSource.ts, useSourceComposerBody
    // 경유)가 요구하는 최소 모양 — 실제 tRPC 데코레이션 프록시의 _def()를 흉내낸다.
    source: { create: { _def: () => ({ path: ["source", "create"] }) } },
  },
}));

const { useCreateSource } = await import("./useCreateSource");

const SPACE_ID = "space-1";

describe("useCreateSource", () => {
  beforeEach(() => {
    localStorage.clear();
    useMutationMock.mockClear();
    invalidateMock.mockClear();
  });

  function getOptions() {
    renderHook(() => useCreateSource());
    return useMutationMock.mock.calls[0][1];
  }

  it("onMutate(제출 시점)에 저장된 원문을 즉시 지운다 — mutate() 콜백이 아니라 훅 옵션 레벨", () => {
    setRecordEntry("sourceComposerBody", SPACE_ID, "원문");
    const options = getOptions();

    options.onMutate({ spaceId: SPACE_ID, body: "원문" });

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBeNull();
  });

  it("onError(실패)에 지워둔 원문을 되돌린다 (실패는 사용자 잘못이 아니다)", () => {
    const options = getOptions();

    options.onError(new Error("fail"), { spaceId: SPACE_ID, body: "원문" });

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBe("원문");
  });

  it("onSuccess(성공)에 원문이 계속 비어 있고 listPending을 무효화한다", () => {
    const options = getOptions();

    options.onSuccess(undefined, { spaceId: SPACE_ID, body: "원문" });

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBeNull();
    expect(invalidateMock).toHaveBeenCalledOnce();
  });
});
