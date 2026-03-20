import { Outlet } from "@tanstack/react-router";

import { DevToolbar } from "@web/app/components/devtools/DevToolbar";
import { getEnv } from "@web/app/env";

const IS_LOCAL_DEV = getEnv().APP_ENV === "development";

export function App() {
  return (
    <>
      <Outlet />
      {IS_LOCAL_DEV && <DevToolbar />}
    </>
  );
}
