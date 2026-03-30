import type { ReactNode } from "react";

interface TabbedPanelLayoutProps {
  header: ReactNode;
  children: ReactNode;
}

export function TabbedPanelLayout({
  header,
  children,
}: TabbedPanelLayoutProps) {
  return (
    <main className="flex flex-1 flex-col bg-surface-card min-w-0">
      {header}
      <div className="flex flex-1 flex-col overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
        {children}
      </div>
    </main>
  );
}
