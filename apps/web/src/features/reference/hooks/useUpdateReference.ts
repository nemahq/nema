import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

export function useUpdateReference() {
  const utils = trpc.useUtils();
  const { t } = useTranslation();

  return useMutation(trpc.reference.update, {
    // reference.get만 반환(await)한다 — ReferenceEditor가 읽기 모드로 돌아가는 시점을
    // 이 재조회 완료에 맞추기 위함. list는 이 화면 전환과 무관해 fire-and-forget.
    // 이 invalidate가 reject하면(네트워크 등) TanStack이 이미 성공한 mutation
    // 전체를 error로 뒤집어(onSuccess가 던진 값을 그대로 전파) 저장은 실제로
    // 끝났는데 편집 폼이 안 닫히고 실패 토스트가 뜨므로, catch로 흡수해 성공
    // 경로를 지킨다.
    onSuccess: (_data, variables) => {
      void utils.reference.list.invalidate();
      return utils.reference.get
        .invalidate({ referenceId: variables.referenceId })
        .catch(() => toast.error(t("common.refresh_failed")));
    },
  });
}
