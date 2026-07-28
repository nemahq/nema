import { trpc } from "@web/lib/trpc";

// 공용 useMutation 래퍼를 거치면 onMutate→onError context 타입 연결이 끊긴다
// (useReassignSourceSpace.ts 참고) — 이 훅의 소비처는 isPendingAfterDelay를
// 안 써서 trpc 원본을 직접 쓴다.
export function useUpdateSourceBody() {
  const utils = trpc.useUtils();

  return trpc.source.updateBody.useMutation({
    // blur 즉시 배너·목록의 "정리할 내용 없음" 표시가 사라져야 자연스러워
    // 낙관적으로 반영한다 — invalidate 왕복을 기다리면 그 사이 이미 지난
    // 판정이 화면에 남는다. inputChangedSinceDigestion=true는 서버가 실제로
    // 계산할 값과 같다(source-service.ts의 hasInputChangedSinceDigestion).
    async onMutate({ sourceId, body }) {
      await utils.source.listPending.cancel();
      const prevData = utils.source.listPending.getData();
      utils.source.listPending.setData(undefined, (data) =>
        data
          ? {
              ...data,
              items: data.items.map((item) =>
                item.sourceId === sourceId
                  ? { ...item, body, inputChangedSinceDigestion: true }
                  : item,
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
    },
    onSettled: () => utils.source.listPending.invalidate(),
  });
}
