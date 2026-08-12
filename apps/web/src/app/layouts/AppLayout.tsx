import { Suspense } from "react";
import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "@web/components/layout/AppSidebar";
import { ContentAreaFallback } from "@web/components/layout/ContentAreaFallback";

export function AppLayout() {
  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar />
      <Suspense fallback={<ContentAreaFallback />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
