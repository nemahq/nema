import type { ReactNode } from "react";

import { EmptyState } from "@web/features/memory/components/EmptyState";
import { Header } from "@web/features/memory/components/Header";
import { useEntityListSuspenseQuery } from "@web/features/memory/hooks/useEntityListQuery";

interface MemoryTabShellProps {
  children: ReactNode;
}

export function MemoryTabShell({ children }: MemoryTabShellProps) {
  const [entities] = useEntityListSuspenseQuery();

  if (entities.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <Header />
      {children}
    </>
  );
}
