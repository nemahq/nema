import { Suspense } from "react";
import { Outlet } from "@tanstack/react-router";

import { ContentAreaFallback } from "@web/components/layout/ContentAreaFallback";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";

export function SidebarLayout() {
  return (
    <>
      <SessionSidebar />
      <Suspense fallback={<ContentAreaFallback />}>
        <Outlet />
      </Suspense>
    </>
  );
}
