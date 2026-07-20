import { Suspense } from "react";

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
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { DigestCandidateCard } from "./DigestCandidateCard";
import { ReferenceCandidateCard } from "./ReferenceCandidateCard";
import { ReferenceMergeCard } from "./ReferenceMergeCard";
import {
  ReviewEditingProvider,
  useReviewEditing,
} from "./ReviewEditingProvider";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewNavigationBar } from "./ReviewNavigationBar";
import { SourceTextPanel } from "./SourceTextPanel";

const CONFIRM_DISABLED_REASON_KEY = {
  no_candidates: "review.confirm_disabled_no_candidates",
  missing_title: "review.confirm_disabled_missing_title",
  empty_label: "review.confirm_disabled_empty_label",
  empty_reference: "review.confirm_disabled_empty_reference",
} as const;

// open(=pending) 상태인 ingestion changeset의 리뷰 화면 — Open/Closed가 URL을
// 공유하므로(ChangesetDetailScreen 게이트), 확정·버리기 성공 시 별도 이동 없이
// getByNumber를 무효화하기만 하면 같은 URL이 자연히 ClosedReviewScreen으로 넘어간다
// (useConfirmReview/useDiscardReview가 그 무효화를 담당).
// relation의 open 리뷰는 여기가 아니라 Digest 상세 판정 모드가 맡는다(review-flow.md).
interface OpenReviewScreenProps {
  spacePublicId: string;
  spaceId: string;
  changesetNumber: number;
}

function OpenReviewNavSkeleton() {
  return <NavigationBar />;
}

function OpenReviewContent({
  spacePublicId,
  spaceId,
  changesetNumber,
}: OpenReviewScreenProps) {
  const [review] = useDigestReviewSuspenseQuery(spaceId, changesetNumber);

  return (
    <ReviewEditingProvider review={review}>
      <OpenReviewBody
        spacePublicId={spacePublicId}
        spaceId={spaceId}
        changesetNumber={changesetNumber}
      />
    </ReviewEditingProvider>
  );
}

function OpenReviewBody({
  spacePublicId,
  spaceId,
  changesetNumber,
}: OpenReviewScreenProps) {
  const { t } = useTranslation();
  const review = useReviewEditing((state) => state.review);
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
  } = useReviewEditing((state) => state.derived);
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
    <main className="flex flex-1 flex-col bg-surface-card">
      <ReviewNavigationBar spacePublicId={spacePublicId} title={reviewTitle} />

      <div data-main-scroll-area className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          <ReviewHeader
            title={reviewTitle}
            changesetNumber={review.changesetNumber}
            status="pending"
            time={review.sourceCreatedAt}
            actions={
              <OpenReviewHeaderActions
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
        </div>
      </div>
    </main>
  );
}

interface OpenReviewHeaderActionsProps {
  onDiscard: () => void;
  onConfirm: () => void;
  discardPending: boolean;
  discardDisabled: boolean;
  confirmDisabled: boolean;
}

function OpenReviewHeaderActions({
  onDiscard,
  onConfirm,
  discardPending,
  discardDisabled,
  confirmDisabled,
}: OpenReviewHeaderActionsProps) {
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

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 리뷰 콘텐츠 쿼리(digestReview.get)에 대한 Suspense만
// 책임진다.
export function OpenReviewScreen(props: OpenReviewScreenProps) {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 flex-col bg-surface-card">
          <OpenReviewNavSkeleton />
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
