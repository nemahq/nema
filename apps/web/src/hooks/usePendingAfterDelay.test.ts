import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { usePendingAfterDelay } from "./usePendingAfterDelay";

const TEST_DELAY_MS = 250;
const PARTIAL_ELAPSED_MS = 100;

describe("usePendingAfterDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isPending이 true여도 지연 시간 전엔 false를 반환한다", () => {
    const { result } = renderHook(() =>
      usePendingAfterDelay(true, TEST_DELAY_MS),
    );
    expect(result.current).toBe(false);
  });

  it("지연 시간이 지나면 true를 반환한다", () => {
    const { result } = renderHook(() =>
      usePendingAfterDelay(true, TEST_DELAY_MS),
    );

    act(() => {
      vi.advanceTimersByTime(TEST_DELAY_MS);
    });

    expect(result.current).toBe(true);
  });

  it("지연 시간 전에 isPending이 false가 되면 계속 false다(깜빡임 방지)", () => {
    const { result, rerender } = renderHook(
      ({ isPending }) => usePendingAfterDelay(isPending, TEST_DELAY_MS),
      { initialProps: { isPending: true } },
    );

    act(() => {
      vi.advanceTimersByTime(PARTIAL_ELAPSED_MS);
    });
    rerender({ isPending: false });

    act(() => {
      vi.advanceTimersByTime(TEST_DELAY_MS);
    });

    expect(result.current).toBe(false);
  });

  it("true로 표시된 뒤 isPending이 false가 되면 다시 false로 돌아간다", () => {
    const { result, rerender } = renderHook(
      ({ isPending }) => usePendingAfterDelay(isPending, TEST_DELAY_MS),
      { initialProps: { isPending: true } },
    );

    act(() => {
      vi.advanceTimersByTime(TEST_DELAY_MS);
    });
    expect(result.current).toBe(true);

    rerender({ isPending: false });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(false);
  });
});
