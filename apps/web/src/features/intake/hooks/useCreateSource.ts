import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

interface CreateSourceInput {
  body: string;
  spaceId: string;
  timeZone?: string;
  sessionId?: string;
}

export function useCreateSource() {
  const utils = trpc.useUtils();
  const mutation = useMutation(trpc.source.create, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });

  // 서버 스키마는 spaceId를 optional로 둔다(MCP·dev-harness는 안 보내고 서버가 대신
  // 가장 오래된 Space로 채운다). 하지만 제품 화면의 호출부는 항상 어느 Space에 쓰는지
  // 알아야 한다 — 빠뜨리면 조용히 엉뚱한 Space로 새는 게 이 훅이 고친 버그라, 타입으로
  // 다시 생략 못 하게 좁힌다. optional을 받는 함수는 required만 주는 호출자에게도
  // 안전해(contravariance) 이 대입은 캐스트 없이 그대로 타입체크를 통과한다.
  const narrowed: Omit<typeof mutation, "mutate" | "mutateAsync"> & {
    mutate: (
      input: CreateSourceInput,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => void;
    mutateAsync: (
      input: CreateSourceInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) => ReturnType<typeof mutation.mutateAsync>;
  } = mutation;

  return narrowed;
}
