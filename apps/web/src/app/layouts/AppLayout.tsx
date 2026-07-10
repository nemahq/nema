import { Outlet } from "@tanstack/react-router";

import { OnboardingGate } from "@web/features/onboarding";
import { WorkspaceBootstrapGate } from "@web/features/workspace";

export function AppLayout() {
  return (
    <OnboardingGate>
      <WorkspaceBootstrapGate>
        <div className="flex h-dvh">
          <Outlet />
        </div>
      </WorkspaceBootstrapGate>
    </OnboardingGate>
  );
}
