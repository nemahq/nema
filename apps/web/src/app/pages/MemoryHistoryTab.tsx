import { Suspense } from "react";

import { MemoryTabShell } from "@web/features/memory/components/MemoryTabShell";
import { useRememberMemoryTab } from "@web/features/memory/hooks/useRememberMemoryTab";

export function MemoryHistoryTab() {
  useRememberMemoryTab("history");
  return (
    <Suspense>
      <MemoryTabShell>
        {/* TODO(NEM-102): 히스토리 리스트 렌더 */}
        {null}
      </MemoryTabShell>
    </Suspense>
  );
}
