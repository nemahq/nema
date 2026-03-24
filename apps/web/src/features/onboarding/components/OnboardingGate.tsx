import type { ReactNode } from "react";

import { useOnboardingCheck } from "../hooks/useOnboardingCheck";
import { OnboardingModal } from "./OnboardingModal";

interface OnboardingGateProps {
  children: ReactNode;
}

export function OnboardingGate({ children }: OnboardingGateProps) {
  const { needsOnboarding, isLoading } = useOnboardingCheck();

  if (isLoading) {
    return null;
  }

  if (needsOnboarding) {
    return <OnboardingModal />;
  }

  return children;
}
