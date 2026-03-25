import { Outlet } from "@tanstack/react-router";

import { OnboardingGate } from "@web/features/onboarding";
import { SaveQueuePanel } from "@web/features/session/components/SaveQueuePanel";
import { SaveQueueProvider } from "@web/features/session/contexts/SaveQueueContext";

export function AppLayout() {
  return (
    <OnboardingGate>
      <SaveQueueProvider>
        <div className="flex h-dvh">
          <Outlet />
        </div>
        <SaveQueuePanel />
      </SaveQueueProvider>
    </OnboardingGate>
  );
}
