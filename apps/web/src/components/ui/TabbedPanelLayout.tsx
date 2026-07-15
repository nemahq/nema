import type { ReactNode } from "react";

interface TabbedPanelLayoutProps {
  header: ReactNode;
  onHeaderDragOver?: (e: React.DragEvent) => void;
  children: ReactNode;
}

export function TabbedPanelLayout({
  header,
  onHeaderDragOver,
  children,
}: TabbedPanelLayoutProps) {
  return (
    <main className="flex flex-1 flex-col min-w-0 min-h-0">
      <div
        role="tablist"
        tabIndex={-1}
        className="relative flex items-end border-b border-border/50 bg-surface-base"
        onDragOver={(e) => {
          e.stopPropagation();
          onHeaderDragOver?.(e);
        }}
        onDragEnter={(e) => e.stopPropagation()}
      >
        {header}
      </div>
      <div className="relative flex flex-1 flex-col overflow-y-auto p-5">
        {children}
      </div>
    </main>
  );
}
