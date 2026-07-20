import { Badge } from "@nema-io/weave";

import type { ReviewCitedReference } from "@web/features/review/types";

interface CitedReferenceBadgesProps {
  referenceIds: string[];
  citedReferences: ReviewCitedReference[];
}

export function CitedReferenceBadges({
  referenceIds,
  citedReferences,
}: CitedReferenceBadgesProps) {
  const cited = referenceIds
    .map((id) => citedReferences.find((reference) => reference.id === id))
    .filter((reference): reference is ReviewCitedReference =>
      Boolean(reference),
    );

  if (cited.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {cited.map((reference) => (
        <Badge key={reference.id} variant="info">
          {reference.title}
        </Badge>
      ))}
    </div>
  );
}
