import { trpc } from "@web/lib/trpc";

export function useReassignSourceSpace() {
  const utils = trpc.useUtils();

  // 낙관적 업데이트가 onMutate→onError로 context를 넘기는데, 공용 useMutation
  // 래퍼(TOptions를 인자에서 구조적으로 추론)를 거치면 이 연결이 끊겨 context가
  // {}로 타입 추론된다 — isPendingAfterDelay를 안 쓰는 훅이라 trpc 원본을 직접 쓴다.
  return trpc.source.reassignSpace.useMutation({
    // 드롭다운 선택 즉시 pill·체크마크가 바뀌어야 자연스러워 낙관적으로 반영—
    // 서버 응답을 기다리면 그 사이 이전 Space가 계속 보인다.
    async onMutate({ sourceId, spaceId }) {
      await utils.source.listPending.cancel();
      const prevData = utils.source.listPending.getData();
      utils.source.listPending.setData(undefined, (data) =>
        data
          ? {
              ...data,
              items: data.items.map((item) =>
                item.sourceId === sourceId ? { ...item, spaceId } : item,
              ),
            }
          : data,
      );
      return { prevData };
    },
    onError: (_error, _vars, context) => {
      if (context?.prevData) {
        utils.source.listPending.setData(undefined, context.prevData);
      }
      // 실패 원인 중 하나가 "선택한 Space 멤버십을 방금 잃음"인데, useSpaceList가
      // 10분 staleTime을 갖고 있어 셀렉트에 이미 없어진 Space가 최대 10분간 계속
      // 옵션으로 남는다 — 실패 시 목록을 무효화해 다음 시도부턴 정확한 옵션만 보이게 한다.
      utils.space.list.invalidate();
    },
    onSettled: () => utils.source.listPending.invalidate(),
  });
}
