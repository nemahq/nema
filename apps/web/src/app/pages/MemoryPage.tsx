import { Suspense } from "react";

import { EmptyState } from "@web/features/memory/components/EmptyState";
import { Header } from "@web/features/memory/components/Header";
import { Overview } from "@web/features/memory/components/Overview";
import { useEntityListSuspenseQuery } from "@web/features/memory/hooks/useEntityListQuery";

function MemoryContent() {
  const [entities] = useEntityListSuspenseQuery();

  if (entities.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <Header />
      <Overview />
    </>
  );
}

export function MemoryPage() {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <Suspense>
        <MemoryContent />
      </Suspense>
    </main>
  );
}
