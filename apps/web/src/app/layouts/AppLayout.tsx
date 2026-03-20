import { Outlet } from "@tanstack/react-router";

import { ProfileProvider } from "@web/features/profile";

export function AppLayout() {
  return (
    <ProfileProvider>
      <div className="flex h-dvh">
        <Outlet />
      </div>
    </ProfileProvider>
  );
}
