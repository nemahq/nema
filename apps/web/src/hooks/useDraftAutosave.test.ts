import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { useDraftAutosave } from "./useDraftAutosave.js";

describe("useDraftAutosave", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("localStorage가 비어있으면 initialValue를 반환한다", () => {
    const { result } = renderHook(() => useDraftAutosave("test", ""));
    expect(result.current[0]).toBe("");
  });

  it("localStorage에 저장된 값이 있으면 복원한다", () => {
    localStorage.setItem("test", JSON.stringify("saved text"));
    const { result } = renderHook(() => useDraftAutosave("test", ""));
    expect(result.current[0]).toBe("saved text");
  });

  it("debounce 후 localStorage에 저장한다", () => {
    const { result } = renderHook(() => useDraftAutosave("test", ""));

    act(() => {
      result.current[1]("hello");
    });

    expect(localStorage.getItem("test")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(localStorage.getItem("test")).toBe(JSON.stringify("hello"));
  });

  it("clear()로 저장된 값을 제거하고 initialValue로 초기화한다", () => {
    localStorage.setItem("test", JSON.stringify("saved"));
    const { result } = renderHook(() => useDraftAutosave("test", ""));

    act(() => {
      result.current[2].clear();
    });

    expect(result.current[0]).toBe("");
    expect(localStorage.getItem("test")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(localStorage.getItem("test")).toBeNull();
  });

  it("언마운트 시 대기 중인 값을 즉시 저장한다", () => {
    const { result, unmount } = renderHook(() => useDraftAutosave("test", ""));

    act(() => {
      result.current[1]("pending");
    });

    expect(localStorage.getItem("test")).toBeNull();

    unmount();

    expect(localStorage.getItem("test")).toBe(JSON.stringify("pending"));
  });

  it("객체 타입도 직렬화/역직렬화된다", () => {
    const initial = { title: "", body: "" };
    const { result } = renderHook(() => useDraftAutosave("test-obj", initial));

    act(() => {
      result.current[1]({ title: "제목", body: "본문" });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(localStorage.getItem("test-obj")).toBe(
      JSON.stringify({ title: "제목", body: "본문" }),
    );
  });
});
