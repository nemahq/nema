import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import {
  deleteRecordEntry,
  getRecordEntry,
  setRecordEntry,
} from "@web/utils/localStorage";

// useSourceComposerBody는 useIsCreatingSource(전역 뮤테이션 캐시 구독)에 의존한다.
// 이 훅 자체의 책임(저장소 동기화 규칙)만 격리해서 검증하기 위해, "진행 중" 신호는
// 테스트가 직접 제어하는 값으로 대체한다 — useMutation.test.ts와 같은 패턴.
let mockIsSubmitting = false;
// isCreatingSourceNow는 useIsCreatingSource와 별도로 조작 가능해야 한다 —
// mutate() 호출 직후 리렌더가 아직 안 끝난 찰나(useIsCreatingSource는 아직
// 예전 값)에도 flush는 동기 조회(isCreatingSourceNow)로 최신 값을 봐야 한다는
// 레이스 픽스를 이 둘을 분리해야만 검증할 수 있다.
let mockIsCreatingSourceNow: boolean | null = null;
vi.mock("./useIsCreatingSource", () => ({
  useIsCreatingSource: () => mockIsSubmitting,
  isCreatingSourceNow: () => mockIsCreatingSourceNow ?? mockIsSubmitting,
}));

const { useSourceComposerBody } = await import("./useSourceComposerBody");

const SPACE_ID = "space-1";
const DEBOUNCE_MS = 500;

describe("useSourceComposerBody", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mockIsSubmitting = false;
    mockIsCreatingSourceNow = null;
  });

  afterEach(() => {
    // renderHook은 자동 정리되지 않는다 — flushOnUnmount가 등록한 beforeunload
    // 리스너가 다음 테스트까지 살아남으면 다른 테스트의 window 이벤트 디스패치에
    // 반응해 저장소를 오염시킨다.
    cleanup();
    vi.useRealTimers();
  });

  it("입력 후 디바운스 시간이 지나면 저장소에 반영된다 (미제출 본문 보존, 회귀 확인)", () => {
    const { result } = renderHook(() => useSourceComposerBody(SPACE_ID));

    act(() => {
      result.current.setBody("작성 중");
    });
    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBe("작성 중");
  });

  it("제출 중이 아니면 언마운트 시 최신 본문을 즉시 저장한다 (미제출 본문 보존 회귀 확인)", () => {
    const { result, unmount } = renderHook(() =>
      useSourceComposerBody(SPACE_ID),
    );

    act(() => {
      result.current.setBody("아직 안 보낸 글");
    });
    unmount();

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBe(
      "아직 안 보낸 글",
    );
  });

  it("제출 진행 중엔 화면에 남은 본문을 저장소에 다시 쓰지 않는다 (디바운스)", () => {
    mockIsSubmitting = true;
    const { result } = renderHook(() => useSourceComposerBody(SPACE_ID));

    act(() => {
      result.current.setBody("제출된 원문");
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBeNull();
  });

  it("제출 진행 중 beforeunload가 발생해도 화면에 남은 본문을 저장소에 되살리지 않는다 (새로고침 유령 텍스트 방지)", () => {
    mockIsSubmitting = true;
    const { result } = renderHook(() => useSourceComposerBody(SPACE_ID));

    act(() => {
      result.current.setBody("제출된 원문");
    });
    // useCreateSource의 onMutate가 제출 시점에 이미 지운 상태를 흉내낸다.
    deleteRecordEntry("sourceComposerBody", SPACE_ID);

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBeNull();
  });

  it("mutate() 직후 리렌더가 아직 안 끝난 찰나에 발생한 beforeunload도 동기 조회로 걸러낸다 (레이스 픽스)", () => {
    mockIsSubmitting = false;
    const { result } = renderHook(() => useSourceComposerBody(SPACE_ID));

    act(() => {
      result.current.setBody("제출된 원문");
    });
    // onMutate가 이미 저장소를 지웠지만, useIsCreatingSource(리렌더 반영)는
    // 아직 이 순간을 못 따라간 상태 — mockIsSubmitting은 여전히 false.
    deleteRecordEntry("sourceComposerBody", SPACE_ID);
    mockIsCreatingSourceNow = true;

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBeNull();
  });

  it("제출이 성공으로 끝나면(저장소가 비워진 뒤) 화면 본문도 즉시 비워진다", () => {
    mockIsSubmitting = true;
    const { result, rerender } = renderHook(() =>
      useSourceComposerBody(SPACE_ID),
    );

    act(() => {
      result.current.setBody("제출된 원문");
    });
    // useCreateSource의 onSuccess가 저장소를 지운 상태를 흉내낸다.
    deleteRecordEntry("sourceComposerBody", SPACE_ID);
    mockIsSubmitting = false;
    rerender();
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.body).toBe("");
  });

  it("성공 직후, resync 타이머가 돌기 전 beforeunload가 끼어들어도 유령 텍스트를 되살리지 않는다 (종료 시점 레이스 픽스)", () => {
    mockIsSubmitting = true;
    const { result, rerender } = renderHook(() =>
      useSourceComposerBody(SPACE_ID),
    );

    act(() => {
      result.current.setBody("제출된 원문");
    });
    // useCreateSource의 onSuccess가 저장소를 지운 상태를 흉내낸다. isCreatingSourceNow도
    // 즉시 false로 바뀐다 — 뮤테이션 캐시 동기 조회라 리렌더를 기다리지 않는다.
    deleteRecordEntry("sourceComposerBody", SPACE_ID);
    mockIsSubmitting = false;
    mockIsCreatingSourceNow = false;
    rerender();
    // 이 시점에서 resyncAfterSubmit의 setTimeout(0)은 아직 안 돌았다 — 화면 body는
    // 여전히 "제출된 원문"이다. vi.advanceTimersByTime을 부르지 않고 바로 beforeunload를
    // 보낸다.
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(getRecordEntry("sourceComposerBody", SPACE_ID)).toBeNull();
  });

  it("제출이 실패로 끝나면(저장소가 복원된 뒤) 화면 본문이 그대로 보존된다 (실패는 사용자 잘못이 아니다)", () => {
    mockIsSubmitting = true;
    const { result, rerender } = renderHook(() =>
      useSourceComposerBody(SPACE_ID),
    );

    act(() => {
      result.current.setBody("제출된 원문");
    });
    // useCreateSource의 onError가 저장소를 원문으로 되돌린 상태를 흉내낸다.
    setRecordEntry("sourceComposerBody", SPACE_ID, "제출된 원문");
    mockIsSubmitting = false;
    rerender();
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.body).toBe("제출된 원문");
  });
});
