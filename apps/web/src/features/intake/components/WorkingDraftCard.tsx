import type { DraftCardProps } from "@web/features/intake/types";

import { DraftCardShell } from "./DraftCardShell";
import { DraftProcessingHeader } from "./DraftProcessingHeader";

export function WorkingDraftCard({
  sourceId,
  spaceId,
  title,
  body,
  createdAt,
  onSelect,
}: DraftCardProps) {
  return (
    <DraftCardShell onSelect={onSelect}>
      <DraftProcessingHeader
        sourceId={sourceId}
        spaceId={spaceId}
        title={title}
        createdAt={createdAt}
      />
      <p className="line-clamp-4 text-sm leading-relaxed text-fg-tertiary">
        {body}
      </p>
    </DraftCardShell>
  );
}
