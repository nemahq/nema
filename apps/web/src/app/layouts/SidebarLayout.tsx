import { Outlet } from "@tanstack/react-router";

import { SessionSidebar } from "@web/features/session/components/SessionSidebar";

export function SidebarLayout() {
  return (
    <>
      <SessionSidebar />
      <Outlet />
    </>
  );
}
