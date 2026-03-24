import type { ReactNode } from "react";

import { useDeferredProfileQuery } from "@web/features/profile/hooks/useDeferredProfileQuery";

import { OnboardingModal } from "./OnboardingModal";

interface OnboardingGateProps {
  children: ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const { data: profile, isLoading } = useDeferredProfileQuery();

  if (isLoading) {
    return children;
  }

  if (!profile) {
    return <OnboardingModal />;
  }

  return children;
}
