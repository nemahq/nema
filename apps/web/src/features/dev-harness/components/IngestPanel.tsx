import { useState } from "react";

import { Button } from "@nema-io/weave";

import { SourceHistoryList } from "@web/features/dev-harness/components/SourceHistoryList";
import { useCreateSource } from "@web/features/dev-harness/hooks/useCreateSource";

export function IngestPanel() {
  const [sourceInput, setSourceInput] = useState("");
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  const createSource = useCreateSource();

  function handleSubmit() {
    const trimmedInput = sourceInput.trim();
    if (!trimmedInput || createSource.isPending) {
      return;
    }
    createSource.mutate(
      { body: trimmedInput },
      {
        onSuccess: ({ sourceId }) => {
          setSourceInput("");
          setExpandedSourceId(sourceId);
        },
      },
    );
  }

  function handleToggleSource(sourceId: string) {
    setExpandedSourceId((prev) => (prev === sourceId ? null : sourceId));
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">넣기</h2>

      <div className="flex flex-col gap-2">
        <textarea
          value={sourceInput}
          onChange={(e) => setSourceInput(e.target.value)}
          placeholder="다듬지 말고 그대로 던지기 — 회의 메모, 생각, 붙여넣기 무엇이든"
          rows={5}
          className="w-full resize-y rounded-lg border border-border bg-surface-raised p-3 text-sm text-fg-primary outline-none focus:border-border-strong"
        />
        <Button
          size="xs"
          className="self-end"
          onClick={handleSubmit}
          disabled={!sourceInput.trim() || createSource.isPending}
        >
          던지기
        </Button>
      </div>

      <SourceHistoryList
        expandedSourceId={expandedSourceId}
        onToggleSource={handleToggleSource}
      />
    </section>
  );
}
