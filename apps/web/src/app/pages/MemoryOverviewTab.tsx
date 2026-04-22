import { Suspense } from "react";

import { MemoryTabShell } from "@web/features/memory/components/MemoryTabShell";
import { Overview } from "@web/features/memory/components/Overview";
import { useRememberMemoryTab } from "@web/features/memory/hooks/useRememberMemoryTab";

export function MemoryOverviewTab() {
  useRememberMemoryTab("overview");
  return (
    <Suspense>
      <MemoryTabShell>
        <Overview />
      </MemoryTabShell>
    </Suspense>
  );
}
