import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

export function useAddReferenceTag() {
  const utils = trpc.useUtils();
  const { t } = useTranslation();

  // invalidate가 reject해도 mutation 자체가 실패로 뒤집히지 않도록 catch로
  // 흡수한다 — TagAddPopover가 이 결과를 await해서 팝오버를 닫을지 판단하므로,
  // 그러지 않으면 태그 연결은 성공했는데 팝오버가 실패로 인식해 안 닫힌다.
  return useMutation(trpc.reference.addTag, {
    onSuccess: (_data, variables) =>
      utils.reference.get
        .invalidate({ referenceId: variables.referenceId })
        .catch(() => toast.error(t("common.refresh_failed"))),
  });
}
