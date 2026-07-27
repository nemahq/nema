import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useBufferedValue } from "./useBufferedValue";

const COMMIT_DELAY_MS = 400;
const PARTIAL_ELAPSED_MS = 100;

describe("useBufferedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("입력이 이어지는 동안엔 넘기지 않는다", () => {
    const commit = vi.fn();
    const { result } = renderHook(() =>
      useBufferedValue<string>("원본", commit),
    );

    act(() => result.current.setValue("원"));
    act(() => vi.advanceTimersByTime(PARTIAL_ELAPSED_MS));
    act(() => result.current.setValue("원본 수정"));
    act(() => vi.advanceTimersByTime(PARTIAL_ELAPSED_MS));

    expect(commit).not.toHaveBeenCalled();
    expect(result.current.value).toBe("원본 수정");
  });

  it("입력이 멈추면 마지막 값 한 번만 넘긴다", () => {
    const commit = vi.fn();
    const { result } = renderHook(() =>
      useBufferedValue<string>("원본", commit),
    );

    act(() => result.current.setValue("한"));
    act(() => result.current.setValue("한 번"));
    act(() => vi.advanceTimersByTime(COMMIT_DELAY_MS));

    expect(commit).toHaveBeenCalledExactlyOnceWith("한 번");
  });

  it("commitNow는 넘길 게 없으면 아무 일도 안 한다", () => {
    const commit = vi.fn();
    const { result } = renderHook(() =>
      useBufferedValue<string>("원본", commit),
    );

    act(() => result.current.commitNow());
    act(() => result.current.setValue("고침"));
    act(() => result.current.commitNow());
    act(() => result.current.commitNow());

    expect(commit).toHaveBeenCalledExactlyOnceWith("고침");
  });

  // 커밋 직후 리렌더 전에 다음 글자가 들어오는 순간 — 여기서 "바깥이 바뀌었다"로
  // 오판하면 방금 친 글자가 조용히 사라진다.
  it("커밋한 값이 committed로 되돌아와도 그 뒤 입력을 덮지 않는다", () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committed }: { committed: string }) =>
        useBufferedValue(committed, commit),
      { initialProps: { committed: "원본" } },
    );

    act(() => result.current.setValue("고침"));
    act(() => result.current.commitNow());
    act(() => result.current.setValue("고침 더"));
    rerender({ committed: "고침" });

    expect(result.current.value).toBe("고침 더");
  });

  // 타입 변경으로 body가 초기화되는 경로 — 초안이 밖에서 갈아끼워지면 화면도 따라가야
  // 한다. 안 따라가면 지워진 필드에 옛 텍스트가 그대로 남는다.
  it("바깥에서 값이 바뀌면 로컬 입력을 버리고 따라간다", () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committed }: { committed: string }) =>
        useBufferedValue(committed, commit),
      { initialProps: { committed: "원본" } },
    );

    act(() => result.current.setValue("치던 중"));
    rerender({ committed: "" });

    expect(result.current.value).toBe("");

    act(() => vi.advanceTimersByTime(COMMIT_DELAY_MS));
    expect(commit).not.toHaveBeenCalled();
  });
});
