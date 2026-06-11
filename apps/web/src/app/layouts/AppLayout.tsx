import { Outlet } from "@tanstack/react-router";

import { OnboardingGate } from "@web/features/onboarding";

export function AppLayout() {
  return (
    <OnboardingGate>
      <div className="flex h-dvh">
        <Outlet />
      </div>
    </OnboardingGate>
  );
}
