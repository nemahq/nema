import { Outlet } from "@tanstack/react-router";

import { SaveQueuePanel } from "@web/features/session/components/SaveQueuePanel";
import { SaveQueueProvider } from "@web/features/session/contexts/SaveQueueContext";

export function AppLayout() {
  return (
    <SaveQueueProvider>
      <div className="flex h-dvh">
        <Outlet />
      </div>
      <SaveQueuePanel />
    </SaveQueueProvider>
  );
}
