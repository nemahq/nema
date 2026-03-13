import { Suspense } from "react";
import { Outlet } from "@tanstack/react-router";

import { ContentAreaSpinner } from "@web/components/layout/ContentAreaSpinner";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";

export function SidebarLayout() {
  return (
    <>
      <SessionSidebar />
      <Suspense fallback={<ContentAreaSpinner />}>
        <Outlet />
      </Suspense>
    </>
  );
}
