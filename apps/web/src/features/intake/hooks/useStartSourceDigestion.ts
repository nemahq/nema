import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// cancelled·failed·empty 셋 다 이 훅으로 (다시) 처리를 건다 — 출발 상태가 달라도
// 도착지는 같다는 게 서버 계약(start_source_digestion)이라, 훅도 하나로 둔다.
// UI 문구("정리")를 편들지 않고 procedure명을 따른 이름 — "재생성" 시절 남은
// 관습이지만, UI 라벨이 지금 "정리"로 통일된 뒤에도 그대로 유효하다.
export function useStartSourceDigestion() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.startDigestion, {
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
