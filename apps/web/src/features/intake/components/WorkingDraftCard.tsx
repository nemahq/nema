import type { DraftCardData } from "@web/features/intake/types";

import { DraftCardShell } from "./DraftCardShell";
import { DraftProcessingActions } from "./DraftProcessingActions";

interface WorkingDraftCardProps {
  draft: DraftCardData;
  onSelect: () => void;
}

export function WorkingDraftCard({ draft, onSelect }: WorkingDraftCardProps) {
  return (
    <DraftCardShell onSelect={onSelect}>
      <DraftProcessingActions
        sourceId={draft.sourceId}
        spaceId={draft.spaceId}
        title={draft.title}
        createdAt={draft.createdAt}
      />
      <p className="line-clamp-4 text-sm leading-relaxed text-fg-tertiary">
        {draft.body}
      </p>
    </DraftCardShell>
  );
}
