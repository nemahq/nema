import type { ReactNode } from "react";

import { useProfileQuery } from "@web/features/profile";

import { OnboardingModal } from "./OnboardingModal";

interface OnboardingGateProps {
  children: ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const { data: profile, isLoading } = useProfileQuery();

  const needsOnboarding = !isLoading && !profile;

  return (
    <>
      {children}
      {needsOnboarding && <OnboardingModal />}
    </>
  );
}
