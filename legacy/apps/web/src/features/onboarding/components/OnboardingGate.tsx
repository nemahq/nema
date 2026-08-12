import type { ReactNode } from "react";

import { useProfileQuery } from "@web/features/profile";

import { OnboardingModal } from "./OnboardingModal";

interface OnboardingGateProps {
  children: ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const { data: profile, isLoading, isError } = useProfileQuery();

  const needsOnboarding = !isLoading && !isError && !profile;

  return (
    <>
      {children}
      {needsOnboarding && <OnboardingModal />}
    </>
  );
}
