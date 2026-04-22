import { Outlet } from "@tanstack/react-router";

export function MemoryPage() {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <Outlet />
    </main>
  );
}
