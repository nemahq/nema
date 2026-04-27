import type { ReactNode } from "react";

import { EmptyState } from "@web/features/memory/components/EmptyState";
import { Header } from "@web/features/memory/components/Header";
import { useEntityListSuspenseQuery } from "@web/features/memory/hooks/useEntityListQuery";

interface MemoryTabLayoutProps {
  children: ReactNode;
}

export function MemoryTabLayout({ children }: MemoryTabLayoutProps) {
  const [entities] = useEntityListSuspenseQuery();

  if (entities.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
        {children}
      </div>
    </>
  );
}
