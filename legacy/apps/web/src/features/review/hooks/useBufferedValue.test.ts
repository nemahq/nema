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

  // hasPendingEdits(포커스 재조회 펜딩 판정)가 이 값으로 "아직 안 넘어간 입력이
  // 있는지"를 판정한다 — commitNow와 어긋나면 재조회가 편집 중인 내용을 덮어쓴다.
  it("dirty는 아직 안 넘긴 값이 있는 동안만 참이고, 커밋되면 거짓으로 돌아간다", () => {
    const commit = vi.fn();
    const { result } = renderHook(() =>
      useBufferedValue<string>("원본", commit),
    );

    expect(result.current.dirty).toBe(false);

    act(() => result.current.setValue("고침"));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.commitNow());
    expect(result.current.dirty).toBe(false);
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

  // 리스트 값은 커밋마다 새 배열이라 참조 비교로는 항상 "바뀌었다"가 된다 — 커스텀
  // isEqual 없이는 매 echo가 외부 변경으로 오인돼 그 사이 타이핑이 사라진다
  // (DigestBodyField의 리스트 필드가 실제로 겪은 경로).
  it("커스텀 isEqual로 배열의 참조가 바뀌어도 내용이 같으면 echo로 인식한다", () => {
    const commit = vi.fn();
    const arrayIsEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((item, index) => item === b[index]);
    const { result, rerender } = renderHook(
      ({ committed }: { committed: string[] }) =>
        useBufferedValue(committed, commit, arrayIsEqual),
      { initialProps: { committed: ["a", "b"] } },
    );

    act(() => result.current.setValue(["a", "c"]));
    act(() => result.current.commitNow());
    act(() => result.current.setValue(["a", "c", "d"]));
    // 캐시를 거쳐 돌아온 committed는 커밋한 값과 내용은 같지만 참조가 다른 새 배열이다.
    rerender({ committed: ["a", "c"] });

    expect(result.current.value).toEqual(["a", "c", "d"]);
  });

  // settled 계산이 ??로 handedOver.value를 다뤘다면, null도 정당한 T 값인 필드에서
  // null을 커밋한 뒤 원래 값으로 되돌리는 재커밋을 "이미 그 값"이라며 건너뛴다.
  it("null도 유효한 값인 필드에서 커밋 후 원래 값으로 되돌리면 다시 커밋한다", () => {
    const commit = vi.fn();
    const { result } = renderHook(() =>
      useBufferedValue<string | null>("A", commit),
    );

    act(() => result.current.setValue(null));
    act(() => result.current.commitNow());
    act(() => result.current.setValue("A"));
    act(() => result.current.commitNow());

    expect(commit).toHaveBeenNthCalledWith(1, null);
    expect(commit).toHaveBeenNthCalledWith(2, "A");
  });
});
