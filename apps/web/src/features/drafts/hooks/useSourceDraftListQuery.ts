import { trpc } from "@web/lib/trpc";

// LNB 초안 항목은 Outlet Suspense 밖(사이드바)에서 노출 여부를 직접 계산하므로
// 서스펜드하면 안 된다 — non-suspense 변형을 유지한다.
export function useSourceDraftListQuery() {
  return trpc.source.list.useQuery();
}

export function useSourceDraftListSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.source.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.source.list.useSuspenseQuery(undefined, options);
}
