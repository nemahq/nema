import { Suspense } from "react";

import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { usePendingRelationSuspenseQuery } from "@web/features/review/hooks/usePendingRelationQuery";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { ConflictRelationJudgment } from "./ConflictRelationJudgment";
import { DuplicateMergeJudgment } from "./DuplicateMergeJudgment";

function RelationJudgmentContent() {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [changesetDetail] = useChangesetDetailSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  const [pendingRelation] = usePendingRelationSuspenseQuery(
    spaceId,
    changesetNumber,
  );

  const title = changesetDisplayTitle(changesetDetail, t);

  if (pendingRelation.body.kind === "conflict_pending") {
    const { from, to } = pendingRelation.body;
    return (
      <ConflictRelationJudgment
        title={title}
        reviewerName={pendingRelation.reviewerName}
        createdAt={pendingRelation.createdAt}
        changesetId={pendingRelation.changesetId}
        from={from}
        to={to}
      />
    );
  }

  const { keeper, duplicate, mergeDraft } = pendingRelation.body;
  return (
    <DuplicateMergeJudgment
      title={title}
      reviewerName={pendingRelation.reviewerName}
      createdAt={pendingRelation.createdAt}
      changesetId={pendingRelation.changesetId}
      keeper={keeper}
      duplicate={duplicate}
      mergeDraft={mergeDraft}
    />
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 화면 전용 쿼리(getPendingRelationByNumber)에 대한
// Suspense만 책임진다.
export function RelationJudgmentScreen() {
  return (
    <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
      <RelationJudgmentContent />
    </Suspense>
  );
}
