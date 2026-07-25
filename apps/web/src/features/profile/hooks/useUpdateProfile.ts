import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";
import { toast } from "@web/utils/toast";

export function useUpdateProfile() {
  const utils = trpc.useUtils();
  const { t } = useTranslation();

  return useMutation(trpc.profile.update, {
    // 반환(await)해서 profile.get 재조회가 끝날 때까지 pending 상태를 유지한다 —
    // 이 재조회로 화면 전환(온보딩 종료)을 판단하는 소비처가 OnboardingGate다.
    // invalidate가 reject해도 mutation 자체가 실패로 뒤집히지 않도록 catch로
    // 흡수한다 — 그러지 않으면 저장은 성공했는데 온보딩 모달이 계속 떠 있게 된다.
    onSuccess() {
      return utils.profile.get
        .invalidate()
        .catch(() => toast.error(t("common.refresh_failed")));
    },
  });
}
