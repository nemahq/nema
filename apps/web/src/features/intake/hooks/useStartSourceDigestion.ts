import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

// cancelled·failed·empty 셋 다 이 훅으로 (다시) 처리를 건다 — 출발 상태가 달라도
// 도착지는 같다는 게 서버 계약(start_source_digestion)이라, 훅도 하나로 둔다.
// UI 라벨은 호출부마다 다르다(재시도의 "Extract" vs 편집 후 재추출의
// "Regenerate") — 훅 이름은 그 UI 문구 중 하나를 편들지 않고 procedure명을 따른다.
export function useStartSourceDigestion() {
  const utils = trpc.useUtils();

  return useMutation(trpc.source.startDigestion, {
    onSuccess: () => utils.source.listPending.invalidate(),
    // IdleDraftDetailPanel이 이미 인라인 Alert로 실패를 보여준다.
    meta: { skipGlobalToast: true },
  });
}
