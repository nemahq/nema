import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useUpdateProfile() {
  const utils = trpc.useUtils();

  return useMutation(trpc.profile.update, {
    // 반환(await)해서 profile.get 재조회가 끝날 때까지 pending 상태를 유지한다 —
    // 이 재조회로 화면 전환을 판단하는 소비처(OnboardingModal)가 있다.
    onSuccess() {
      return utils.profile.get.invalidate();
    },
  });
}
