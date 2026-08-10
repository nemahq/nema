import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

// digestReview.get은 여기서 invalidate하지 않는다 — 그 RPC 가드가 status='open'만
// 허용해서, 버려진 뒤 재조회하면 에러가 난다. 대신 changeset.getByNumber만 반환(await)해서
// 화면 전환을 만드는 이 재조회가 끝날 때까지 mutation을 pending 상태로 붙든다 — 모든
// 상태가 URL을 공유해서(changesetDetailRegistry), 이 쿼리가 새 status(closed)+outcome
// (discarded)로 다시 읽혀야 같은 URL이 ChangesetRecordScreen으로 넘어간다. 나머지
// invalidate는 이 화면 전환과 무관해 fire-and-forget으로 둔다.
export function useDiscardReview(spaceId: string, changesetNumber: number) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.digestReview.discard, {
    onSuccess: () => {
      utils.source.listPending.invalidate();
      utils.changeset.listChangesets.invalidate();
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}
