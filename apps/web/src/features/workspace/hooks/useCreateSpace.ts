import { trpc } from "@web/lib/trpc";

export function useCreateSpace() {
  const utils = trpc.useUtils();

  return trpc.space.create.useMutation({
    // 새 Space로 바로 navigate하는 소비처(SpaceCreateForm)가 있어 — invalidate가
    // 끝나길 기다린 뒤에 그 onSuccess가 이어지게 한다(useMutation onSuccess는
    // mutate() 호출부 onSuccess보다 먼저, 그리고 await되어 실행된다). 그래야
    // bootstrap.spaces에 새 Space가 이미 반영된 채로 SpaceOverview가 렌더된다 —
    // 안 그러면 반영 전 잠깐 "존재하지 않음"으로 보일 수 있음.
    async onSuccess() {
      await utils.workspace.bootstrap.invalidate();
    },
  });
}
