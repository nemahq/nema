import { trpc } from "@web/lib/trpc";

// 상세 패널의 「관련 다이제스트」 블록 전용 — useDigestSuspenseQuery(digest.get)로
// 얻은 내부 id를 받아 이어 부른다(feedback_hook_params: 라우트 파라미터 훅을
// 내부에서 직접 호출하지 않고 값으로 받는다).
export function useDigestRelationsSuspenseQuery(
  digestId: string,
  options?: Omit<
    Parameters<typeof trpc.digest.getRelations.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.digest.getRelations.useSuspenseQuery({ digestId }, options);
}
