import { Text } from "@nema-io/weave";

import type { ChangesetReferenceSnapshot } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { ReferenceReadonlyCard } from "./ReferenceReadonlyCard";

interface ReferenceReadonlySectionProps {
  newReferences: ChangesetReferenceSnapshot[];
  mergedReferences: ChangesetReferenceSnapshot[];
}

// ingestion_applied 스냅샷의 Reference 묶음 — 열린 리뷰의 ReferenceSection과 같은
// 자리, closed라 읽기 전용 카드로만 그린다.
export function ReferenceReadonlySection({
  newReferences,
  mergedReferences,
}: ReferenceReadonlySectionProps) {
  const { t } = useTranslation();
  const references = [...newReferences, ...mergedReferences];

  if (references.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <Text as="h2" size="sm" weight="semibold" color="secondary">
        {t("review.reference_section_title", { count: references.length })}
      </Text>
      <div className="flex flex-col">
        {references.map((reference) => (
          <ReferenceReadonlyCard key={reference.id} reference={reference} />
        ))}
      </div>
    </div>
  );
}
