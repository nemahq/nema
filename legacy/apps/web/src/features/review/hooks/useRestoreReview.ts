import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// useDiscardReview.ts의 정반대 방향 — 같은 이유로 changeset.getByNumber만 반환(await)해서
// 화면 전환을 만드는 이 재조회가 끝날 때까지 mutation을 pending 상태로 붙든다. 이
// changeset이 open으로 돌아오면 같은 URL이 IngestionScreen으로 넘어가고, 그 화면이
// digestReview.get을 처음부터 새로 조회하므로 여기서 그 쿼리를 따로 invalidate할
// 필요는 없다.
export function useRestoreReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.digestReview.restore, {
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.changeset.listChangesets.invalidate();
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}
