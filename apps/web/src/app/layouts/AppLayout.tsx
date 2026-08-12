import { Suspense } from "react";
import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "@web/components/layout/AppSidebar";
import { ContentAreaFallback } from "@web/components/layout/ContentAreaFallback";
import { OnboardingGate } from "@web/features/onboarding";

export function AppLayout() {
  return (
    <OnboardingGate>
      <div className="flex h-dvh overflow-hidden">
        <AppSidebar />
        <Suspense fallback={<ContentAreaFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </OnboardingGate>
  );
}
