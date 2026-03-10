import { Outlet } from "@tanstack/react-router";

export function AppLayout() {
  return (
    <div className="flex h-dvh">
      <Outlet />
    </div>
  );
}
