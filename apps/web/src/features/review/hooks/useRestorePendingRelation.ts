import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

export function useRestorePendingRelation(
  spaceId: string,
  changesetNumber: number,
) {
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  return useMutation(trpc.changeset.restorePendingRelation, {
    onSuccess: () => {
      utils.changeset.listChangesets.invalidate();
      utils.changeset.getPendingRelationByNumber.invalidate({
        spaceId,
        number: changesetNumber,
      });
      return utils.changeset.getByNumber
        .invalidate({ spaceId, number: changesetNumber })
        .catch(() => toast.error(t("review.detail_refresh_failed")));
    },
  });
}
