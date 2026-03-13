import { Suspense } from "react";
import { Outlet } from "@tanstack/react-router";

import { ContentAreaSkeleton } from "@web/components/layout/ContentAreaSkeleton";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";

export function SidebarLayout() {
  return (
    <>
      <SessionSidebar />
      <Suspense fallback={<ContentAreaSkeleton />}>
        <Outlet />
      </Suspense>
    </>
  );
}
