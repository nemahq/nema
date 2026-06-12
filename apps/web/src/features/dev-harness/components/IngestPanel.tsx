import { useState } from "react";

import { Button } from "@nema-io/weave";

import { SourceCard } from "@web/features/dev-harness/components/SourceCard";
import {
  useCreateSource,
  useSourceListQuery,
} from "@web/features/dev-harness/hooks/useSourceQueries";
import { getErrorMessage } from "@web/lib/getErrorMessage";

export function IngestPanel() {
  const [body, setBody] = useState("");
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  const { data: sourceList } = useSourceListQuery();
  const createSource = useCreateSource({
    onCreated: (sourceId) => {
      setBody("");
      setExpandedSourceId(sourceId);
    },
  });

  function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed || createSource.isPending) {
      return;
    }
    createSource.mutate({ body: trimmed });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-fg-primary">넣기</h2>

      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="다듬지 말고 그대로 던지기 — 회의 메모, 생각, 붙여넣기 무엇이든"
          rows={5}
          className="w-full resize-y rounded-lg border border-border bg-surface-raised p-3 text-sm text-fg-primary outline-none focus:border-border-strong"
        />
        <div className="flex items-center justify-between gap-2">
          {createSource.isError ? (
            <p className="min-w-0 truncate text-xs text-status-error">
              {getErrorMessage(createSource.error)}
            </p>
          ) : (
            <span />
          )}
          <Button
            size="xs"
            onClick={handleSubmit}
            disabled={!body.trim() || createSource.isPending}
          >
            던지기
          </Button>
        </div>
      </div>

      <h3 className="mt-2 text-xs font-semibold text-fg-tertiary">
        던진 글 {sourceList ? `(${sourceList.sources.length})` : ""}
      </h3>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {sourceList?.sources.length === 0 && (
          <p className="text-xs text-fg-tertiary">
            아직 없음 — 위에서 첫 글을 던져보기
          </p>
        )}
        {sourceList?.sources.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            expanded={source.id === expandedSourceId}
            onToggle={() =>
              setExpandedSourceId((prev) =>
                prev === source.id ? null : source.id,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
