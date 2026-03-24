import { Outlet } from "@tanstack/react-router";

import { DevToolbar } from "@web/app/components/devtools/DevToolbar";
import { getEnv } from "@web/app/env";

const SHOW_DEV_TOOLBAR = getEnv().APP_ENV !== "production";

export function App() {
  return (
    <>
      <Outlet />
      {SHOW_DEV_TOOLBAR && <DevToolbar />}
    </>
  );
}
