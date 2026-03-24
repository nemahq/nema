import type { ReactNode } from "react";

import { useProfileQuery } from "@web/features/profile/hooks/useProfile";

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
