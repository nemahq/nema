import { memo } from "react";

import { DraftCardShell } from "./DraftCardShell";
import { DraftProcessingHeader } from "./DraftProcessingHeader";

interface WorkingDraftCardProps {
  sourceId: string;
  title: string | null;
  body: string;
  createdAt: string;
  onSelect: (sourceId: string) => void;
}

export const WorkingDraftCard = memo(function WorkingDraftCard({
  sourceId,
  title,
  body,
  createdAt,
  onSelect,
}: WorkingDraftCardProps) {
  function handleSelect() {
    onSelect(sourceId);
  }

  return (
    <DraftCardShell onSelect={handleSelect}>
      <DraftProcessingHeader
        sourceId={sourceId}
        title={title}
        createdAt={createdAt}
      />
      <p className="line-clamp-4 text-sm leading-relaxed text-fg-tertiary">
        {body}
      </p>
    </DraftCardShell>
  );
});
