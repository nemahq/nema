import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { usePendingAfterDelay } from "./usePendingAfterDelay";

describe("usePendingAfterDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isPending이 true여도 지연 시간 전엔 false를 반환한다", () => {
    const { result } = renderHook(() => usePendingAfterDelay(true, 250));
    expect(result.current).toBe(false);
  });

  it("지연 시간이 지나면 true를 반환한다", () => {
    const { result } = renderHook(() => usePendingAfterDelay(true, 250));

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe(true);
  });

  it("지연 시간 전에 isPending이 false가 되면 계속 false다(깜빡임 방지)", () => {
    const { result, rerender } = renderHook(
      ({ isPending }) => usePendingAfterDelay(isPending, 250),
      { initialProps: { isPending: true } },
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ isPending: false });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBe(false);
  });

  it("true로 표시된 뒤 isPending이 false가 되면 다시 false로 돌아간다", () => {
    const { result, rerender } = renderHook(
      ({ isPending }) => usePendingAfterDelay(isPending, 250),
      { initialProps: { isPending: true } },
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(true);

    rerender({ isPending: false });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(false);
  });
});
