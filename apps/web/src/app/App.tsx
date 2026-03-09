import { Outlet } from "@tanstack/react-router";

import { DevToolbar } from "@web/app/components/DevToolbar";

export function App() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <DevToolbar />}
    </>
  );
}
