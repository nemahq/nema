import { Suspense, useMemo } from "react";

import { useNotificationSoftAsk } from "@web/features/notifications";
import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import { useDigestReviewSuspenseQuery } from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import { computeReviewEditingState } from "@web/features/review/reviewEditingState";
import { useCurrentSpaceId } from "@web/features/workspace";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { DigestSection } from "./DigestSection";
import { EditingProvider, useEditing } from "./EditingProvider";
import { IngestionActions } from "./IngestionActions";
import { ReferenceSection } from "./ReferenceSection";

const CONFIRM_DISABLED_REASON_KEY = {
  no_candidates: "review.confirm_disabled_no_candidates",
  missing_title: "review.confirm_disabled_missing_title",
  empty_label: "review.confirm_disabled_empty_label",
  empty_reference: "review.confirm_disabled_empty_reference",
} as const;

// pending 상태인 ingestion changeset의 편집 화면 — 모든 상태가 URL을 공유하므로
// (changesetDetailRegistry), 확정·버리기 성공 시 별도 이동 없이 getByNumber를
// 무효화하기만 하면 같은 URL이 자연히 ChangesetRecordScreen으로 넘어간다
// (useConfirmReview/useDiscardReview가 그 무효화를 담당).
//
// 확정 페이로드와 확정 차단 조건은 후보 전체를 봐야 나오는 값이라 여기서 편집 상태를
// 통째로 구독한다. 타이핑마다 이 함수는 다시 돌지만 두 섹션 요소는 overrides에
// 의존하지 않아 React 컴파일러가 캐시하므로, 아래 트리는 통째로 건너뛴다.
function IngestionContent() {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [review] = useDigestReviewSuspenseQuery(spaceId, changesetNumber);
  const overrides = useEditing((state) => state.overrides);
  const resetEditing = useEditing((state) => state.reset);
  const {
    digestRows,
    referenceRows,
    dirty,
    hasCandidates,
    hasEmptyTitle,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates,
  } = useMemo(
    () => computeReviewEditingState(review, overrides),
    [review, overrides],
  );
  const reviewTitle = review.sourceTitle ?? t("review.digest_review_title");

  const updateReview = useUpdateReview(spaceId, changesetNumber);
  const confirmReview = useConfirmReview(spaceId, changesetNumber);
  const discardReview = useDiscardReview(spaceId, changesetNumber);
  const showNotificationSoftAsk = useNotificationSoftAsk();

  // ChangesetDetailRouter가 이미 구독 중인 같은 쿼리라 새 요청은 안 나간다 — 확정·
  // 버리기 성공 후 이 쿼리가 다시 fetch되어야 실제로 ChangesetRecordScreen으로
  // 넘어가므로, 그 재조회가 끝날 때까지도 버튼을 계속 잠가둔다(그 전엔 mutation
  // 자체는 끝났어도 화면은 아직 안 바뀐 상태). isFetching을 mutation 성공 여부와
  // 무관하게 걸면 포커스 재진입 등 무관한 백그라운드 재조회에도 폼이 잠기므로,
  // 확정·버리기가 실제로 성공한 뒤의 재조회로만 좁힌다.
  const [, changesetDetailQuery] = useChangesetDetailSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  const settling =
    (confirmReview.isSuccess || discardReview.isSuccess) &&
    changesetDetailQuery.isFetching;

  const locked =
    updateReview.isPending ||
    confirmReview.isPending ||
    discardReview.isPendingAfterDelay ||
    settling;
  const error =
    updateReview.error ?? confirmReview.error ?? discardReview.error;
  const confirmDisabled =
    locked ||
    !hasCandidates ||
    hasEmptyTitle ||
    hasEmptyLabel ||
    hasEmptyReference;

  const confirmDisabledReasonCode = computeConfirmDisabledReason(
    hasCandidates,
    hasEmptyTitle,
    hasEmptyLabel,
    hasEmptyReference,
  );
  const confirmDisabledReasonText =
    confirmDisabledReasonCode &&
    t(CONFIRM_DISABLED_REASON_KEY[confirmDisabledReasonCode]);

  async function handleConfirm() {
    if (confirmDisabled) {
      return;
    }
    updateReview.reset();
    confirmReview.reset();
    try {
      await runConfirmReview({
        changesetId: review.changesetId,
        dirty,
        digestRows,
        newReferences: referenceRows,
        referenceUpdates,
        updateReview: updateReview.mutateAsync,
        confirmReview: confirmReview.mutateAsync,
        onSaved: resetEditing,
      });
      showNotificationSoftAsk();
    } catch {
      // 에러는 updateReview.error/confirmReview.error로 화면에 노출된다.
    }
  }

  function handleDiscard() {
    if (locked) {
      return;
    }
    discardReview.mutate(
      { changesetId: review.changesetId },
      { onSuccess: () => showNotificationSoftAsk() },
    );
  }

  return (
    <ChangesetDetailLayout title={reviewTitle}>
      <ChangesetDetailHeader
        title={reviewTitle}
        changesetNumber={review.changesetNumber}
        status="pending"
        time={review.sourceCreatedAt}
        actions={
          <IngestionActions
            onDiscard={handleDiscard}
            onConfirm={handleConfirm}
            discardPending={discardReview.isPendingAfterDelay}
            discardDisabled={locked}
            confirmDisabled={confirmDisabled}
          />
        }
      />
      {confirmDisabledReasonText && (
        <p className="text-xs text-fg-tertiary">{confirmDisabledReasonText}</p>
      )}
      {error && (
        <p className="text-sm text-status-error">{getErrorMessage(error)}</p>
      )}

      <DigestSection
        digests={review.digests}
        citedReferences={review.citedReferences}
        disabled={locked}
      />

      <ReferenceSection
        digests={review.digests}
        newReferences={review.newReferences}
        citedReferences={review.citedReferences}
        disabled={locked}
      />
    </ChangesetDetailLayout>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 리뷰 콘텐츠 쿼리(digestReview.get)에 대한 Suspense만
// 책임진다.
export function IngestionScreen() {
  return (
    <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
      <EditingProvider>
        <IngestionContent />
      </EditingProvider>
    </Suspense>
  );
}
