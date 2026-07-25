import { Outlet } from "@tanstack/react-router";

import { OnboardingGate } from "@web/features/onboarding";
import { RealtimeSync } from "@web/features/realtime";
import { WorkspaceBootstrapGate } from "@web/features/workspace";

export function AppLayout() {
  return (
    <OnboardingGate>
      <WorkspaceBootstrapGate>
        <RealtimeSync />
        <div className="flex h-dvh overflow-hidden">
          <Outlet />
        </div>
      </WorkspaceBootstrapGate>
    </OnboardingGate>
  );
}
