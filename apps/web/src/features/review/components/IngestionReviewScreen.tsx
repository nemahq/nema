import { Suspense, useMemo } from "react";

import { Skeleton } from "@nema-io/weave";

import { useNotificationSoftAsk } from "@web/features/notifications";
import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import { useDigestReviewSuspenseQuery } from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import { computeReviewEditingState } from "@web/features/review/reviewEditingState";
import type { ChangesetDetailScreenProps } from "@web/features/review/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { DigestCandidateCard } from "./DigestCandidateCard";
import { IngestionReviewActions } from "./IngestionReviewActions";
import { ReferenceCandidateCard } from "./ReferenceCandidateCard";
import { ReferenceMergeCard } from "./ReferenceMergeCard";
import {
  ReviewEditingProvider,
  useReviewEditing,
} from "./ReviewEditingProvider";
import { SourceTextPanel } from "./SourceTextPanel";

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
function IngestionReviewContent({
  spacePublicId,
  spaceId,
  changesetNumber,
}: ChangesetDetailScreenProps) {
  const { t } = useTranslation();
  const [review] = useDigestReviewSuspenseQuery(spaceId, changesetNumber);
  const overrides = useReviewEditing((state) => state.overrides);
  const dispatch = useReviewEditing((state) => state.dispatch);
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
  } = useMemo(
    () => computeReviewEditingState(review, overrides),
    [review, overrides],
  );
  const reviewTitle = review.sourceTitle ?? t("review.digest_review_title");

  const updateReview = useUpdateReview(spaceId, changesetNumber);
  const confirmReview = useConfirmReview(spaceId, changesetNumber);
  const discardReview = useDiscardReview(spaceId, changesetNumber);
  const showNotificationSoftAsk = useNotificationSoftAsk();

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
    <ChangesetDetailLayout spacePublicId={spacePublicId} title={reviewTitle}>
      <ChangesetDetailHeader
        title={reviewTitle}
        changesetNumber={review.changesetNumber}
        status="pending"
        time={review.sourceCreatedAt}
        actions={
          <IngestionReviewActions
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
            onTitleChange={(title) =>
              dispatch({ type: "digest/setTitle", index, title })
            }
            onBodyChange={(body) =>
              dispatch({ type: "digest/setBody", index, body })
            }
            onTopicsChange={(topics) =>
              dispatch({ type: "digest/setTopics", index, topics })
            }
            onTagsChange={(tags) =>
              dispatch({ type: "digest/setTags", index, tags })
            }
            onRemove={() => dispatch({ type: "digest/remove", index })}
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
              onChange={(next) =>
                dispatch({
                  type: "reference/set",
                  key: reference.key,
                  reference: next,
                })
              }
              onRemove={() =>
                dispatch({ type: "reference/remove", key: reference.key })
              }
            />
          ))}
          {mergeRows.map(({ reference, mergeNote }) => (
            <ReferenceMergeCard
              key={reference.id}
              reference={reference}
              mergeNote={mergeNote}
              disabled={locked}
              onMergeNoteChange={(mergeNote) =>
                dispatch({
                  type: "reference/setMergeNote",
                  referenceId: reference.id,
                  mergeNote,
                })
              }
            />
          ))}
        </div>
      )}
    </ChangesetDetailLayout>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 리뷰 콘텐츠 쿼리(digestReview.get)에 대한 Suspense만
// 책임진다.
export function IngestionReviewScreen(props: ChangesetDetailScreenProps) {
  return (
    <Suspense
      fallback={
        <ChangesetDetailLayoutSkeleton>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </ChangesetDetailLayoutSkeleton>
      }
    >
      <ReviewEditingProvider>
        <IngestionReviewContent {...props} />
      </ReviewEditingProvider>
    </Suspense>
  );
}
