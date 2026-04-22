import { Suspense } from "react";

import { MemoryTabShell } from "@web/features/memory/components/MemoryTabShell";
import { useRememberMemoryTab } from "@web/features/memory/hooks/useRememberMemoryTab";

export function MemoryHistoryTab() {
  useRememberMemoryTab("history");
  return (
    <Suspense>
      <MemoryTabShell>
        <div className="flex-1" />
      </MemoryTabShell>
    </Suspense>
  );
}
