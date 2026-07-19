import { Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Skeleton } from "@nema-io/weave";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { useNotificationSoftAsk } from "@web/features/notifications";
import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import { useDigestReviewSuspenseQuery } from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useReviewEditingState } from "@web/features/review/hooks/useReviewEditingState";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { DigestCandidateCard } from "./DigestCandidateCard";
import { ReferenceCandidateCard } from "./ReferenceCandidateCard";
import { ReferenceMergeCard } from "./ReferenceMergeCard";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewNavigationBar } from "./ReviewNavigationBar";
import { SourceTextPanel } from "./SourceTextPanel";

const CONFIRM_DISABLED_REASON_KEY = {
  no_candidates: "review.confirm_disabled_no_candidates",
  missing_title: "review.confirm_disabled_missing_title",
  empty_label: "review.confirm_disabled_empty_label",
  empty_reference: "review.confirm_disabled_empty_reference",
} as const;

// open(=pending) 상태인 ingestion changeset의 리뷰 화면 — 확정/버리기로 닫히면
// 곧바로 짝 화면인 ClosedReviewScreen(변경사항 상세)으로 이동한다. 그래서 이 화면
// 자체엔 "닫힌" 상태가 없다(digestReview.get RPC 가드도 status='pending'만 허용).
// relation의 open 리뷰는 여기가 아니라 Digest 상세 판정 모드가 맡는다(review-flow.md).
interface OpenReviewScreenProps {
  spacePublicId: string;
  changesetId: string;
}

function OpenReviewContent({
  spacePublicId,
  changesetId,
}: OpenReviewScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [review] = useDigestReviewSuspenseQuery(changesetId);
  const reviewTitle = review.sourceTitle ?? t("review.digest_review_title");

  const updateReview = useUpdateReview(changesetId);
  const confirmReview = useConfirmReview();
  const discardReview = useDiscardReview();
  const showNotificationSoftAsk = useNotificationSoftAsk();

  const {
    digestRows,
    referenceRows,
    mergeRows,
    dirty,
    hasCandidates,
    hasEmptyTitle,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates,
    setDigestTitle,
    setDigestBody,
    setDigestTopics,
    setDigestTags,
    removeDigest,
    setReference,
    removeReference,
    setMergeNote,
  } = useReviewEditingState(review);

  const pending =
    updateReview.isPending ||
    confirmReview.isPending ||
    discardReview.isPendingAfterDelay;
  const error =
    updateReview.error ?? confirmReview.error ?? discardReview.error;
  const locked = pending;
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

  // 확정·버리기로 changeset이 닫히면 이 화면(open 전용)은 유효하지 않게 되므로,
  // 처리 결과의 정본 위치인 ClosedReviewScreen(변경사항 상세)으로 곧바로 넘긴다.
  function goToClosedReview() {
    navigate({
      to: "/space/$spacePublicId/changesets/$changesetNumber",
      params: {
        spacePublicId,
        changesetNumber: String(review.changesetNumber),
      },
    });
  }

  async function handleConfirm() {
    if (confirmDisabled) {
      return;
    }
    updateReview.reset();
    confirmReview.reset();
    try {
      await runConfirmReview({
        changesetId,
        dirty,
        digestRows,
        newReferences: referenceRows,
        referenceUpdates,
        updateReview: updateReview.mutateAsync,
        confirmReview: confirmReview.mutateAsync,
      });
      showNotificationSoftAsk();
      goToClosedReview();
    } catch {
      // 에러는 updateReview.error/confirmReview.error로 화면에 노출된다.
    }
  }

  function handleDiscard() {
    if (locked) {
      return;
    }
    discardReview.mutate(
      { changesetId },
      {
        onSuccess: () => {
          showNotificationSoftAsk();
          goToClosedReview();
        },
      },
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <ReviewNavigationBar spacePublicId={spacePublicId} title={reviewTitle} />

      <div data-main-scroll-area className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          <ReviewHeader
            title={reviewTitle}
            number={review.changesetNumber}
            status="pending"
            time={review.sourceCreatedAt}
            actions={
              <ReviewHeaderActions
                onDiscard={handleDiscard}
                onConfirm={handleConfirm}
                discardPending={discardReview.isPendingAfterDelay}
                discardDisabled={locked}
                confirmDisabled={confirmDisabled}
              />
            }
          />
          {confirmDisabledReasonText && (
            <p className="text-xs text-fg-tertiary">
              {confirmDisabledReasonText}
            </p>
          )}
          {error && (
            <p className="text-sm text-status-error">
              {getErrorMessage(error)}
            </p>
          )}

          <SourceTextPanel body={review.sourceBody} />

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-fg-secondary">
              {t("review.digest_section_title", { count: digestRows.length })}
            </h2>
            {digestRows.map(({ digest, index, title, body, topics, tags }) => (
              <DigestCandidateCard
                key={index}
                spaceId={review.spaceId}
                digest={digest}
                title={title}
                body={body}
                topics={topics}
                tags={tags}
                citedReferences={review.citedReferences}
                disabled={locked}
                onTitleChange={(value) => setDigestTitle(index, value)}
                onBodyChange={(value) => setDigestBody(index, value)}
                onTopicsChange={(next) => setDigestTopics(index, next)}
                onTagsChange={(next) => setDigestTags(index, next)}
                onRemove={() => removeDigest(index)}
              />
            ))}
          </div>

          {referenceRows.length + mergeRows.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-fg-secondary">
                {t("review.reference_section_title", {
                  count: referenceRows.length + mergeRows.length,
                })}
              </h2>
              {referenceRows.map((reference) => (
                <ReferenceCandidateCard
                  key={reference.key}
                  reference={reference}
                  disabled={locked}
                  onChange={(next) => setReference(reference.key, next)}
                  onRemove={() => removeReference(reference.key)}
                />
              ))}
              {mergeRows.map(({ reference, mergeNote }) => (
                <ReferenceMergeCard
                  key={reference.id}
                  reference={reference}
                  mergeNote={mergeNote}
                  disabled={locked}
                  onMergeNoteChange={(value) =>
                    setMergeNote(reference.id, value)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

interface ReviewHeaderActionsProps {
  onDiscard: () => void;
  onConfirm: () => void;
  discardPending: boolean;
  discardDisabled: boolean;
  confirmDisabled: boolean;
}

function ReviewHeaderActions({
  onDiscard,
  onConfirm,
  discardPending,
  discardDisabled,
  confirmDisabled,
}: ReviewHeaderActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="neutral" onClick={onDiscard} disabled={discardDisabled}>
        {discardPending ? t("common.saving") : t("review.discard_action")}
      </Button>
      <Button onClick={onConfirm} disabled={confirmDisabled}>
        {t("review.confirm_action")}
      </Button>
    </div>
  );
}

export function OpenReviewScreen(props: OpenReviewScreenProps) {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 flex-col bg-surface-card">
          <NavigationBar />
          <div data-main-scroll-area className="flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </main>
      }
    >
      <OpenReviewContent {...props} />
    </Suspense>
  );
}
