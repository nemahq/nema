import type { ReactNode } from "react";

interface TabbedPanelLayoutProps {
  header: ReactNode;
  onHeaderDragOver?: (e: React.DragEvent) => void;
  onHeaderDrop?: (e: React.DragEvent) => void;
  children: ReactNode;
}

export function TabbedPanelLayout({
  header,
  onHeaderDragOver,
  onHeaderDrop,
  children,
}: TabbedPanelLayoutProps) {
  return (
    <main className="flex flex-1 flex-col min-w-0">
      <div
        role="tablist"
        tabIndex={-1}
        className="relative flex items-end border-b border-border/50"
        onDragOver={onHeaderDragOver}
        onDrop={onHeaderDrop}
      >
        {header}
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
        {children}
      </div>
    </main>
  );
}
