import { trpc } from "@web/lib/trpc";

// cancelled·failed·empty 셋 다 이 훅으로 (다시) 처리를 건다 — 출발 상태가 달라도
// 도착지는 같다는 게 서버 계약(start_source_digestion)이라, 훅도 하나로 둔다.
// review 1차 이후 "실패 시 재시도" 버튼이 이 훅을 그대로 재사용할 예정.
export function useExtractSource() {
  const utils = trpc.useUtils();

  return trpc.source.startDigestion.useMutation({
    onSuccess: () => utils.source.listPending.invalidate(),
  });
}
