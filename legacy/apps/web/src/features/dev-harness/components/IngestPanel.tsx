import { useState } from "react";

import { PendingSourceList } from "@web/features/dev-harness/components/PendingSourceList";
import { SourceComposer } from "@web/features/dev-harness/components/SourceComposer";
import { SourceHistoryList } from "@web/features/dev-harness/components/SourceHistoryList";

// 넣기 입구 — 원문 던지기 → 초안(대기 원문)에서 Digest 리뷰 확정 → 던진 글(추출).
export function IngestPanel() {
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  function handleToggleSource(sourceId: string) {
    setExpandedSourceId((prev) => (prev === sourceId ? null : sourceId));
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">넣기</h2>

      <SourceComposer />
      <PendingSourceList />

      <SourceHistoryList
        expandedSourceId={expandedSourceId}
        onToggleSource={handleToggleSource}
      />
    </section>
  );
}
