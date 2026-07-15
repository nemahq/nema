import type { DraftCardProps } from "@web/features/intake/types";

import { DraftCardShell } from "./DraftCardShell";
import { DraftProcessingActions } from "./DraftProcessingActions";

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
      <DraftProcessingActions
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
