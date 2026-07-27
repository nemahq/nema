import { Suspense, useMemo, useState } from "react";

import { Alert, Text } from "@nema-io/weave";

import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import { useDigestReviewSuspenseQuery } from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import { computeReviewEditingState } from "@web/features/review/reviewEditingState";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useNotificationSoftAsk } from "@web/hooks/useNotificationSoftAsk";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
import { DigestCandidateList } from "./DigestCandidateList";
import { EditingProvider, useEditing } from "./EditingProvider";
import { IngestionActions } from "./IngestionActions";
import { ReferenceSection } from "./ReferenceSection";

const CONFIRM_DISABLED_REASON_KEY = {
  no_candidates: "review.confirm_disabled_no_candidates",
  missing_title: "review.confirm_disabled_missing_title",
  missing_description: "review.confirm_disabled_missing_description",
  empty_label: "review.confirm_disabled_empty_label",
  empty_reference: "review.confirm_disabled_empty_reference",
} as const;

// open 상태인 ingestion changeset의 편집 화면 — 모든 상태가 URL을 공유하므로
// (changesetDetailRegistry), 확정·버리기 성공 시 별도 이동 없이 getByNumber를
// 무효화하기만 하면 같은 URL이 자연히 ChangesetRecordScreen으로 넘어간다.
//
// 확정 페이로드와 차단 조건은 후보 전체를 봐야 나오는 값이라 편집 상태를 여기서
// 통째로 구독한다. 대신 카드에는 그 파생값을 prop으로 일절 내리지 않는다 — 타이핑으로
// 이 함수가 다시 돌아도 카드 트리는 props가 그대로라 건너뛰고, 실제 값은 각 필드가
// 자기 selector로 가져간다.
function IngestionContent() {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [review] = useDigestReviewSuspenseQuery(spaceId, changesetNumber);
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();
  // 모든 다이제스트가 같은 Source 하나를 공유해 탭 id도 하나뿐이라, activeTabId만으론
  // 어느 카드에서 열었는지 구분되지 않는다 — 가장 최근에 누른 카드를 따로 들고 있어야
  // "이 카드의 트리거가 활성"을 정확히 판정할 수 있다.
  const [activeSourceDigestIndex, setActiveSourceDigestIndex] = useState<
    number | null
  >(null);
  const overrides = useEditing((state) => state.overrides);
  const {
    digestRows,
    referenceRows,
    dirty,
    hasCandidates,
    hasEmptyTitle,
    hasEmptyDescription,
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

  const locked =
    updateReview.isPending ||
    confirmReview.isPending ||
    discardReview.isPendingAfterDelay;
  const confirmDisabled =
    locked ||
    !hasCandidates ||
    hasEmptyTitle ||
    hasEmptyDescription ||
    hasEmptyLabel ||
    hasEmptyReference;

  const confirmDisabledReasonCode = computeConfirmDisabledReason(
    hasCandidates,
    hasEmptyTitle,
    hasEmptyDescription,
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
        expectedVersion: review.draftVersion,
        digestRows,
        newReferences: referenceRows,
        referenceUpdates,
        updateReview: updateReview.mutateAsync,
        confirmReview: confirmReview.mutateAsync,
      });
    } catch {
      // 전역 토스트(mutationCache.onError)가 이미 띄운다.
      return;
    }
    // try 밖에 둔다 — 여기서 던지면(예: localStorage 접근 실패) 위 catch가
    // "mutation 실패는 전역 토스트가 이미 처리한다"는 전제로 조용히 삼켜버린다.
    // 밖에 두면 앱 전역 unhandled rejection 리포트로 정상 노출된다.
    showNotificationSoftAsk();
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

  // 다이제스트가 몇 개든 원문(Source)은 하나뿐이라 탭 id를 sourceId로 고정한다 —
  // 어느 카드에서 눌러도 같은 탭을 열거나 그 탭으로 포커스만 옮긴다. 이미 활성인
  // 카드에서 다시 누르면 닫는다(토글) — 여러 카드가 같은 탭을 가리켜서 "열기"만
  // 있으면 카드 쪽엔 탭을 닫을 방법이 없다.
  function handleViewSource(index: number) {
    if (activeTabId === review.sourceId && activeSourceDigestIndex === index) {
      closeTab(review.sourceId);
      return;
    }
    setActiveSourceDigestIndex(index);
    openTab({
      id: review.sourceId,
      label: reviewTitle,
      content: (
        <div className="flex flex-col gap-3 p-4">
          <Text as="h2" size="lg" weight="semibold">
            {reviewTitle}
          </Text>
          <Text
            as="p"
            size="sm"
            color="secondary"
            className="whitespace-pre-wrap"
          >
            {review.sourceBody}
          </Text>
        </div>
      ),
    });
  }

  const sourceTabOpen = activeTabId === review.sourceId;

  return (
    <ChangesetDetailLayout title={reviewTitle}>
      <ChangesetDetailHeader
        title={reviewTitle}
        changesetNumber={review.changesetNumber}
        state="open"
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
      {/* 조용한 텍스트 한 줄로는 확정이 막혀 있다는 게 눈에 안 들어와서 Alert로
          올렸다. */}
      {confirmDisabledReasonText && (
        <Alert variant="warning">{confirmDisabledReasonText}</Alert>
      )}

      <DigestCandidateList
        digests={review.digests}
        disabled={locked}
        activeSourceIndex={sourceTabOpen ? activeSourceDigestIndex : null}
        onViewSource={handleViewSource}
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
