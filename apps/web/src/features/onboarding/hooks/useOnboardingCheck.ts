import { useProfileQuery } from "@web/features/profile/hooks/useProfile";

export function useOnboardingCheck() {
  const { data: profile, isLoading } = useProfileQuery();
  return { needsOnboarding: !isLoading && !profile, isLoading };
}
