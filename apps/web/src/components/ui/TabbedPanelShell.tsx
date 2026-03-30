import type { ReactNode } from "react";

interface TabbedPanelShellProps {
  header: ReactNode;
  children: ReactNode;
}

export function TabbedPanelShell({ header, children }: TabbedPanelShellProps) {
  return (
    <main className="flex flex-1 flex-col bg-surface-card min-w-0">
      {header}
      <div className="flex flex-1 flex-col overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
        {children}
      </div>
    </main>
  );
}
