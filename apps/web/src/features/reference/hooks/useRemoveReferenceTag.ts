import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

export function useRemoveReferenceTag() {
  const utils = trpc.useUtils();
  const { t } = useTranslation();

  // invalidate가 reject해도 mutation 자체가 실패로 뒤집히지 않도록 catch로
  // 흡수한다(useAddReferenceTag와 같은 이유).
  return useMutation(trpc.reference.removeTag, {
    onSuccess: (_data, variables) =>
      utils.reference.get
        .invalidate({ referenceId: variables.referenceId })
        .catch(() => toast.error(t("common.refresh_failed"))),
  });
}
