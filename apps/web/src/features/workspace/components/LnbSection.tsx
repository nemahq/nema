import { type ReactNode } from "react";

import { useSidebar } from "@web/components/layout/Sidebar";

interface LnbSectionProps {
  label: string;
  children: ReactNode;
}

export function LnbSection({ label, children }: LnbSectionProps) {
  const { collapsed } = useSidebar();

  return (
    <div className="mt-2 flex flex-col gap-0.5">
      {!collapsed && (
        <div className="px-3 pb-0.5 text-xs font-medium uppercase tracking-wide text-fg-tertiary">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
