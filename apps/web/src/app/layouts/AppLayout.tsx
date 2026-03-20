import { Outlet } from "@tanstack/react-router";

import { ProfileProvider } from "@web/hooks/useProfile";

export function AppLayout() {
  return (
    <ProfileProvider>
      <div className="flex h-dvh">
        <Outlet />
      </div>
    </ProfileProvider>
  );
}
