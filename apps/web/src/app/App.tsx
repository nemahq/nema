import { Outlet } from "@tanstack/react-router";

import { DevToolbar } from "@web/app/components/devtools/DevToolbar";

// import.meta.env 직접 접근 — production 빌드에서 tree-shaking 보장
const SHOW_DEV_TOOLBAR = import.meta.env.VITE_APP_ENV !== "production";

export function App() {
  return (
    <>
      <Outlet />
      {SHOW_DEV_TOOLBAR && <DevToolbar />}
    </>
  );
}
