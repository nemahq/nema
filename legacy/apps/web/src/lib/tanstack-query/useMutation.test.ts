import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useMutation } from "./useMutation";

const TEST_DELAY_MS = 250;

interface StubResult {
  isPending: boolean;
  mutate: () => void;
}

describe("useMutation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("procedure.useMutation을 주어진 options로 호출하고 그 결과를 그대로 반환한다", () => {
    const mutate = vi.fn();
    const useMutationSpy = vi.fn(
      (): StubResult => ({ isPending: false, mutate }),
    );
    const options = { onSuccess: vi.fn() };

    const { result } = renderHook(() =>
      useMutation({ useMutation: useMutationSpy }, options),
    );

    expect(useMutationSpy).toHaveBeenCalledWith(options);
    expect(result.current.mutate).toBe(mutate);
    expect(result.current.isPending).toBe(false);
  });

  it("250ms 안에 isPending이 false로 돌아오면 isPendingAfterDelay는 계속 false다", () => {
    let isPending = false;
    const useMutationSpy = vi.fn(
      (): StubResult => ({ isPending, mutate: vi.fn() }),
    );

    const { result, rerender } = renderHook(() =>
      useMutation({ useMutation: useMutationSpy }),
    );
    expect(result.current.isPendingAfterDelay).toBe(false);

    isPending = true;
    rerender();
    expect(result.current.isPendingAfterDelay).toBe(false);

    isPending = false;
    rerender();

    act(() => {
      vi.advanceTimersByTime(TEST_DELAY_MS);
    });
    expect(result.current.isPendingAfterDelay).toBe(false);
  });

  it("isPending이 지연 시간 넘게 유지되면 isPendingAfterDelay가 true가 된다", () => {
    const useMutationSpy = vi.fn(
      (): StubResult => ({ isPending: true, mutate: vi.fn() }),
    );

    const { result } = renderHook(() =>
      useMutation({ useMutation: useMutationSpy }),
    );

    act(() => {
      vi.advanceTimersByTime(TEST_DELAY_MS);
    });

    expect(result.current.isPendingAfterDelay).toBe(true);
  });
});
