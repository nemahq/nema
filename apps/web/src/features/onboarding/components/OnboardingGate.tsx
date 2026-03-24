import type { ReactNode } from "react";

import { useProfileQuery } from "@web/features/profile/hooks/useProfileQuery";

import { OnboardingModal } from "./OnboardingModal";

interface OnboardingGateProps {
  children: ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const { data: profile, isLoading } = useProfileQuery();

  if (isLoading) {
    return null;
  }

  if (!profile) {
    return <OnboardingModal />;
  }

  return children;
}
