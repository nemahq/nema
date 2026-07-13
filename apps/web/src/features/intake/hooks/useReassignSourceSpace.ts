import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useReassignSourceSpace() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.reassignSpace, {
    onSuccess: () => utils.source.listPending.invalidate(),
    // 실패 원인 중 하나가 "선택한 Space 멤버십을 방금 잃음"인데, useSpaceList가
    // 10분 staleTime을 갖고 있어 셀렉트에 이미 없어진 Space가 최대 10분간 계속
    // 옵션으로 남는다 — 실패 시 목록을 무효화해 다음 시도부턴 정확한 옵션만 보이게 한다.
    onError: () => utils.space.list.invalidate(),
  });
}
