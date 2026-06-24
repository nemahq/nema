import { useState } from "react";

import { DraftComposer } from "@web/features/dev-harness/components/DraftComposer";
import { DraftInbox } from "@web/features/dev-harness/components/DraftInbox";
import { SourceHistoryList } from "@web/features/dev-harness/components/SourceHistoryList";

// 넣기 입구 — 초안(직접/assist) → 인박스에서 확정 → 던진 글(추출). 우회 직추출은 없다.
export function IngestPanel() {
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  function handleToggleSource(sourceId: string) {
    setExpandedSourceId((prev) => (prev === sourceId ? null : sourceId));
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">넣기</h2>

      <DraftComposer />
      <DraftInbox />

      <SourceHistoryList
        expandedSourceId={expandedSourceId}
        onToggleSource={handleToggleSource}
      />
    </section>
  );
}
