import { Outlet } from "@tanstack/react-router";

import { OnboardingGate } from "@web/features/onboarding";
import { SaveQueuePanel } from "@web/features/session/components/SaveQueuePanel";
import { SaveQueueProvider } from "@web/features/session/contexts/SaveQueueContext";
import { useAuth } from "@web/hooks/useAuth";

export function AppLayout() {
  const { session, loading } = useAuth();

  if (loading || !session) {
    return null;
  }

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
