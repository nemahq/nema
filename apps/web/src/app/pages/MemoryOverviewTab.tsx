import { Suspense } from "react";

import { MemoryTabLayout } from "@web/features/memory/components/MemoryTabLayout";
import { Overview } from "@web/features/memory/components/Overview";
import { useRememberMemoryTab } from "@web/features/memory/hooks/useRememberMemoryTab";

export function MemoryOverviewTab() {
  useRememberMemoryTab("overview");
  return (
    <Suspense>
      <MemoryTabLayout>
        <Overview />
      </MemoryTabLayout>
    </Suspense>
  );
}
