import { usePendingAfterDelay } from "@web/hooks/usePendingAfterDelay";

interface MutationProcedure<TOptions, TResult extends { isPending: boolean }> {
  useMutation(options?: TOptions): TResult;
}

export function useMutation<TOptions, TResult extends { isPending: boolean }>(
  procedure: MutationProcedure<TOptions, TResult>,
  options?: TOptions,
): TResult & { isPendingAfterDelay: boolean } {
  // procedure는 항상 trpc 프록시의 고정 참조(예: trpc.space.create)라 매 렌더 같은
  // 훅을 가리킨다 — react-compiler는 동적 접근을 정적으로 증명 못 해 경고하지만,
  // 호출부가 조건부로 procedure를 바꿔치기하지 않는 이상 안전하다.
  // eslint-disable-next-line react-compiler/react-compiler -- 위 설명 참고
  const mutation = procedure.useMutation(options);
  const isPendingAfterDelay = usePendingAfterDelay(mutation.isPending);
  return { ...mutation, isPendingAfterDelay };
}
