import { Outlet } from "@tanstack/react-router";

import { ProfileProvider } from "@web/features/profile";
import { SaveQueuePanel } from "@web/features/session/components/SaveQueuePanel";
import { SaveQueueProvider } from "@web/features/session/contexts/SaveQueueContext";

export function AppLayout() {
  return (
    <ProfileProvider>
      <SaveQueueProvider>
        <div className="flex h-dvh">
          <Outlet />
        </div>
        <SaveQueuePanel />
      </SaveQueueProvider>
    </ProfileProvider>
  );
}
