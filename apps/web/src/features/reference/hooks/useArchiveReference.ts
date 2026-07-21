import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

export function useArchiveReference() {
  const utils = trpc.useUtils();
  const { t } = useTranslation();

  return useMutation(trpc.reference.archive, {
    // reference.get만 반환(await)한다 — 이 재조회로 isArchived가 갱신돼야 부모
    // (ReferenceDetailPanel)에서 더보기 메뉴 자체가 언마운트되므로, 다이얼로그가
    // 닫히는 시점을 그 갱신 이후로 맞춘다. invalidate가 reject해도 mutation
    // 자체가 실패로 뒤집히지 않도록 catch로 흡수한다(useUpdateReference와 같은 이유).
    onSuccess: (_data, variables) => {
      void utils.reference.list.invalidate();
      return utils.reference.get
        .invalidate({ referenceId: variables.referenceId })
        .catch(() => toast.error(t("common.refresh_failed")));
    },
  });
}
