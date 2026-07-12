import { Outlet } from "@tanstack/react-router";

import { DevToolbar } from "@web/app/components/devtools/DevToolbar";
import { getEnv } from "@web/app/env";
import { useAuth } from "@web/lib/auth";

const SHOW_DEV_TOOLBAR = getEnv().APP_ENV === "local";

export function App() {
  const { user } = useAuth();

  return (
    <>
      <Outlet />
      {SHOW_DEV_TOOLBAR && user && <DevToolbar />}
    </>
  );
}
