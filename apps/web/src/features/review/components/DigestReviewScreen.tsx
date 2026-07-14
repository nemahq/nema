import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Skeleton } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import { useDigestReviewQuery } from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import type { ChangesetStatus } from "@web/features/review/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetStatusBadge } from "./ChangesetStatusBadge";
import { DigestCandidateCard } from "./DigestCandidateCard";
import { ReferenceCandidateCard } from "./ReferenceCandidateCard";
import { SourceTextPanel } from "./SourceTextPanel";

interface DigestReviewScreenProps {
  spacePublicId: string;
  changesetId: string;
}

// confirm/discard 뒤에는 digestReview.get을 다시 못 부른다(그 RPC 가드가
// status='pending'만 허용) — 화면은 이동하지 않고 이 로컬 결과만으로 상태를 바꾼다.
type ReviewOutcome = "applied" | "discarded" | null;

export function DigestReviewScreen({
  spacePublicId,
  changesetId,
}: DigestReviewScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reviewQuery = useDigestReviewQuery(changesetId);
  const updateReview = useUpdateReview(changesetId);
  const confirmReview = useConfirmReview();
  const discardReview = useDiscardReview();

  const [outcome, setOutcome] = useState<ReviewOutcome>(null);
  const [removedDigestIndexes, setRemovedDigestIndexes] = useState<Set<number>>(
    new Set(),
  );
  const [titleOverrides, setTitleOverrides] = useState<Map<number, string>>(
    new Map(),
  );
  const [removedReferenceKeys, setRemovedReferenceKeys] = useState<Set<string>>(
    new Set(),
  );

  const pending =
    updateReview.isPending ||
    confirmReview.isPending ||
    discardReview.isPendingAfterDelay;
  const error =
    updateReview.error ?? confirmReview.error ?? discardReview.error;

  if (reviewQuery.isError) {
    // confirm·discard 후 재조회하면 여기로 온다(getReview 가드가 pending만 허용) —
    // 그 changeset은 이미 Changeset 상세에서 정상 조회되니 막다른 길로 두지 않는다.
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface-card">
        <p className="text-sm text-status-error">
          {getErrorMessage(reviewQuery.error)}
        </p>
        <Button variant="neutral" onClick={goToChangesetDetail}>
          {t("review.view_changeset_detail_action")}
        </Button>
      </main>
    );
  }
  if (!reviewQuery.data) {
    return (
      <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </main>
    );
  }

  const review = reviewQuery.data;

  const digestRows = review.digests
    .map((digest, index) => ({
      digest,
      index,
      title: titleOverrides.get(index) ?? digest.title,
    }))
    .filter((row) => !removedDigestIndexes.has(row.index));
  const referenceRows = review.newReferences.filter(
    (reference) => !removedReferenceKeys.has(reference.key),
  );

  const dirty =
    removedDigestIndexes.size > 0 ||
    titleOverrides.size > 0 ||
    removedReferenceKeys.size > 0;
  const hasCandidates = digestRows.length + referenceRows.length > 0;
  const hasEmptyTitle = digestRows.some((row) => row.title.trim() === "");
  const locked = pending || outcome !== null;
  const confirmDisabled = locked || !hasCandidates || hasEmptyTitle;

  const confirmDisabledReasonCode = computeConfirmDisabledReason(
    hasCandidates,
    hasEmptyTitle,
  );
  const confirmDisabledReasonText =
    confirmDisabledReasonCode &&
    t(
      confirmDisabledReasonCode === "no_candidates"
        ? "review.confirm_disabled_no_candidates"
        : "review.confirm_disabled_missing_title",
    );

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
        updateReview: updateReview.mutateAsync,
        confirmReview: confirmReview.mutateAsync,
      });
      setOutcome("applied");
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
      { onSuccess: () => setOutcome("discarded") },
    );
  }

  function goToChangesetDetail() {
    navigate({
      to: "/space/$spacePublicId/changesets/$changesetId",
      params: { spacePublicId, changesetId },
    });
  }

  function displayedStatus(): ChangesetStatus {
    if (outcome === "applied") {
      return "applied";
    }
    return outcome === "discarded" ? "rejected" : "pending";
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
        <header className="flex flex-col gap-3 border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <ChangesetStatusBadge status={displayedStatus()} type="ingestion" />
            <RelativeTime dateTime={review.sourceCreatedAt} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-fg-primary">
              {t("review.digest_review_title")}{" "}
              <span className="text-fg-tertiary">
                #{review.changesetNumber}
              </span>
            </h1>
            {outcome === null ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="neutral"
                  onClick={handleDiscard}
                  disabled={locked}
                >
                  {discardReview.isPendingAfterDelay
                    ? t("common.saving")
                    : t("review.discard_action")}
                </Button>
                <Button onClick={handleConfirm} disabled={confirmDisabled}>
                  {t("review.confirm_action")}
                </Button>
              </div>
            ) : (
              <Button variant="neutral" onClick={goToChangesetDetail}>
                {t("review.view_changeset_detail_action")}
              </Button>
            )}
          </div>
          {outcome === null && confirmDisabledReasonText && (
            <p className="text-xs text-fg-tertiary">
              {confirmDisabledReasonText}
            </p>
          )}
          {outcome === "discarded" && (
            <p className="text-sm text-fg-tertiary">
              {t("review.discarded_notice")}
            </p>
          )}
          {error && (
            <p className="text-sm text-status-error">
              {getErrorMessage(error)}
            </p>
          )}
        </header>

        <SourceTextPanel body={review.sourceBody} />

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-fg-secondary">
            {t("review.digest_section_title", { count: digestRows.length })}
          </h2>
          {digestRows.map(({ digest, index, title }) => (
            <DigestCandidateCard
              key={index}
              digest={digest}
              title={title}
              citedReferences={review.citedReferences}
              disabled={locked}
              onTitleChange={(value) =>
                setTitleOverrides((prev) => new Map(prev).set(index, value))
              }
              onRemove={() =>
                setRemovedDigestIndexes((prev) => new Set(prev).add(index))
              }
            />
          ))}
        </div>

        {referenceRows.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-fg-secondary">
              {t("review.reference_section_title", {
                count: referenceRows.length,
              })}
            </h2>
            {referenceRows.map((reference) => (
              <ReferenceCandidateCard
                key={reference.key}
                reference={reference}
                disabled={locked}
                onRemove={() =>
                  setRemovedReferenceKeys((prev) =>
                    new Set(prev).add(reference.key),
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
