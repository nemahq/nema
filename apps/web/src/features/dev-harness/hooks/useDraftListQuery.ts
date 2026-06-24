import { trpc } from "@web/lib/trpc";

// 확정 대기 초안 인박스. 우회 경로 없이 모든 넣기가 이 자리를 거친다.
export function useDraftListQuery() {
  return trpc.draft.list.useQuery();
}
