import { Suspense } from "react";

import { HistoryList } from "@web/features/memory/components/HistoryList";
import { MemoryTabLayout } from "@web/features/memory/components/MemoryTabLayout";
import { useRememberMemoryTab } from "@web/features/memory/hooks/useRememberMemoryTab";

export function MemoryHistoryTab() {
  useRememberMemoryTab("history");
  return (
    <Suspense>
      <MemoryTabLayout>
        <HistoryList />
      </MemoryTabLayout>
    </Suspense>
  );
}
