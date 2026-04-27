import { Suspense } from "react";

import { HistoryList } from "@web/features/memory/components/HistoryList";
import { MemoryTabShell } from "@web/features/memory/components/MemoryTabShell";
import { useRememberMemoryTab } from "@web/features/memory/hooks/useRememberMemoryTab";

export function MemoryHistoryTab() {
  useRememberMemoryTab("history");
  return (
    <Suspense>
      <MemoryTabShell>
        <HistoryList />
      </MemoryTabShell>
    </Suspense>
  );
}
