import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

// useIsCreatingSource.ts가 import하는 실제 @web/lib/trpc는 모듈 스코프에서 env
// 검증까지 겸해(VITE_API_URL 등) 테스트 환경에서 그대로 못 쓴다 — getMutationKey가
// 요구하는 최소 모양(_def())만 흉내낸다.
vi.mock("@web/lib/trpc", () => ({
  trpc: {
    source: { create: { _def: () => ({ path: ["source", "create"] }) } },
  },
}));

const queryClient = new QueryClient();
// isCreatingSourceNow는 @web/lib/tanstack-query의 실제 싱글턴 queryClient를 그대로
// 조회한다 — 테스트도 같은 인스턴스를 QueryClientProvider에 넘겨야 useMutation으로
// 채운 뮤테이션 캐시를 볼 수 있다.
vi.mock("@web/lib/tanstack-query", () => ({ queryClient }));

const { useIsCreatingSource, isCreatingSourceNow } =
  await import("./useIsCreatingSource");

// getMutationKey(trpc.source.create)와 같은 모양([[path]]) — 위 mock과 일치해야
// mutationCache에서 실제로 매칭된다.
const CREATE_SOURCE_MUTATION_KEY = [["source", "create"]];

type CreateSourceVariables = { spaceId?: string; body: string };

function neverResolves(): Promise<never> {
  return new Promise(() => {});
}

function useCreateSourceStub() {
  return useMutation<never, Error, CreateSourceVariables>({
    mutationKey: CREATE_SOURCE_MUTATION_KEY,
    mutationFn: neverResolves,
  });
}

interface WrapperProps {
  children: ReactNode;
}

function Wrapper({ children }: WrapperProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useIsCreatingSource / isCreatingSourceNow", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it("같은 spaceId로 제출이 진행 중이면 useIsCreatingSource가 true", async () => {
    const { result: mutationResult } = renderHook(useCreateSourceStub, {
      wrapper: Wrapper,
    });
    const { result } = renderHook(() => useIsCreatingSource("space-1"), {
      wrapper: Wrapper,
    });

    expect(result.current).toBe(false);

    act(() => {
      mutationResult.current.mutate({ spaceId: "space-1", body: "hi" });
    });

    // 뮤테이션 캐시 알림은 setTimeout(0) 매크로태스크로 스케줄되므로(query-core
    // notifyManager.js의 defaultScheduler) act() 콜백이 동기여도 바로 반영되지 않을 수 있다.
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("다른 spaceId로 진행 중인 제출은 섞이지 않는다 (Space별 격리)", () => {
    const { result: mutationResult } = renderHook(useCreateSourceStub, {
      wrapper: Wrapper,
    });
    const { result } = renderHook(() => useIsCreatingSource("space-2"), {
      wrapper: Wrapper,
    });

    act(() => {
      mutationResult.current.mutate({ spaceId: "space-1", body: "hi" });
    });

    expect(result.current).toBe(false);
  });

  it("spaceId가 없으면(아직 Space 조회 전) 항상 false", () => {
    const { result: mutationResult } = renderHook(useCreateSourceStub, {
      wrapper: Wrapper,
    });
    const { result } = renderHook(() => useIsCreatingSource(undefined), {
      wrapper: Wrapper,
    });

    act(() => {
      mutationResult.current.mutate({ spaceId: undefined, body: "hi" });
    });

    expect(result.current).toBe(false);
  });

  it("isCreatingSourceNow는 리렌더를 기다리지 않고 mutate() 직후 즉시(동기) true를 본다", () => {
    const { result: mutationResult } = renderHook(useCreateSourceStub, {
      wrapper: Wrapper,
    });

    expect(isCreatingSourceNow("space-1")).toBe(false);

    act(() => {
      mutationResult.current.mutate({ spaceId: "space-1", body: "hi" });
    });

    // waitFor 없이 act() 직후 바로 확인 — useSourceComposerBody의 beforeunload
    // flush가 리렌더를 기다릴 수 없는 이유와 같은 지점을 검증한다.
    expect(isCreatingSourceNow("space-1")).toBe(true);
    expect(isCreatingSourceNow("space-2")).toBe(false);
  });
});
