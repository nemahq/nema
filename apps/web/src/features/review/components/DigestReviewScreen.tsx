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
import {
  buildMergeRows,
  toReferenceUpdates,
} from "@web/features/review/referenceMerge";
import type {
  ChangesetStatus,
  ReviewDigest,
  ReviewNewReference,
} from "@web/features/review/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetStatusBadge } from "./ChangesetStatusBadge";
import { DigestCandidateCard } from "./DigestCandidateCard";
import { ReferenceCandidateCard } from "./ReferenceCandidateCard";
import { ReferenceMergeCard } from "./ReferenceMergeCard";
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
  // 다른 페이지처럼 Suspense로 넘기지 않는다 — 이 쿼리의 에러는 route errorComponent로
  // 올리는 대신 여기서 직접 복구 UI(아래 isError 분기)로 잡아야 한다. 에러를 로컬에서
  // 다루려면 쿼리가 non-suspense여야 하므로 로딩(!data)도 함께 수동으로 처리한다.
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
  const [bodyOverrides, setBodyOverrides] = useState<
    Map<number, ReviewDigest["body"]>
  >(new Map());
  const [topicsOverrides, setTopicsOverrides] = useState<
    Map<number, ReviewDigest["topics"]>
  >(new Map());
  const [tagsOverrides, setTagsOverrides] = useState<
    Map<number, ReviewDigest["tags"]>
  >(new Map());
  const [removedReferenceKeys, setRemovedReferenceKeys] = useState<Set<string>>(
    new Set(),
  );
  // 신규 Reference 후보 편집(타입·이름·설명) — key로 원본 draft를 덮어쓴다.
  const [referenceOverrides, setReferenceOverrides] = useState<
    Map<string, ReviewNewReference>
  >(new Map());
  // 기존 Reference 병합 편집 — referenceId로 엔진 제안 mergeNote를 덮어쓴다.
  // "원래대로"(거부)도 원본 body로 되돌리는 override라 별도 상태가 필요 없다.
  const [mergeNoteOverrides, setMergeNoteOverrides] = useState<
    Map<string, string>
  >(new Map());

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
      body: bodyOverrides.get(index) ?? digest.body,
      topics: topicsOverrides.get(index) ?? digest.topics,
      tags: tagsOverrides.get(index) ?? digest.tags,
    }))
    .filter((row) => !removedDigestIndexes.has(row.index));
  const referenceRows = review.newReferences
    .filter((reference) => !removedReferenceKeys.has(reference.key))
    .map((reference) => referenceOverrides.get(reference.key) ?? reference);
  const mergeRows = buildMergeRows({
    citedReferences: review.citedReferences,
    citedReferenceIds: new Set(
      digestRows.flatMap((row) => row.digest.referenceIds),
    ),
    mergeNoteOverrides,
  });

  const dirty =
    removedDigestIndexes.size > 0 ||
    titleOverrides.size > 0 ||
    bodyOverrides.size > 0 ||
    topicsOverrides.size > 0 ||
    tagsOverrides.size > 0 ||
    removedReferenceKeys.size > 0 ||
    referenceOverrides.size > 0 ||
    mergeNoteOverrides.size > 0;
  const hasCandidates = digestRows.length + referenceRows.length > 0;
  const hasEmptyTitle = digestRows.some((row) => row.title.trim() === "");
  const hasEmptyLabel = digestRows.some(
    (row) =>
      row.topics.some((topic) => topic.name.trim() === "") ||
      row.tags.some((tag) => tag.title.trim() === ""),
  );
  // 신규 Reference 이름·설명, 기존 Reference 병합 설명 모두 필수(zod min(1)) — 비우면
  // 확정 시 원문 에러가 새므로 라벨 공백과 같은 결로 사전 차단한다.
  const hasEmptyReference =
    referenceRows.some(
      (reference) =>
        reference.title.trim() === "" || reference.body.trim() === "",
    ) || mergeRows.some((row) => row.mergeNote.trim() === "");
  const referenceUpdates = toReferenceUpdates(mergeRows);
  const locked = pending || outcome !== null;
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
  const CONFIRM_DISABLED_REASON_KEY = {
    no_candidates: "review.confirm_disabled_no_candidates",
    missing_title: "review.confirm_disabled_missing_title",
    empty_label: "review.confirm_disabled_empty_label",
    empty_reference: "review.confirm_disabled_empty_reference",
  } as const;
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
        changesetId,
        dirty,
        digestRows,
        newReferences: referenceRows,
        referenceUpdates,
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
            <h1 className="min-w-0 truncate text-lg font-semibold text-fg-primary">
              <span className="text-fg-tertiary">
                #{review.changesetNumber} ·{" "}
              </span>
              {review.sourceTitle ?? t("review.digest_review_title")}
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
              onTitleChange={(value) =>
                setTitleOverrides((prev) => new Map(prev).set(index, value))
              }
              onBodyChange={(value) =>
                setBodyOverrides((prev) => new Map(prev).set(index, value))
              }
              onTopicsChange={(topics) =>
                setTopicsOverrides((prev) => new Map(prev).set(index, topics))
              }
              onTagsChange={(tags) =>
                setTagsOverrides((prev) => new Map(prev).set(index, tags))
              }
              onRemove={() =>
                setRemovedDigestIndexes((prev) => new Set(prev).add(index))
              }
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
                  setReferenceOverrides((prev) =>
                    new Map(prev).set(reference.key, next),
                  )
                }
                onRemove={() =>
                  setRemovedReferenceKeys((prev) =>
                    new Set(prev).add(reference.key),
                  )
                }
              />
            ))}
            {mergeRows.map(({ reference, mergeNote }) => (
              <ReferenceMergeCard
                key={reference.id}
                reference={reference}
                mergeNote={mergeNote}
                disabled={locked}
                onMergeNoteChange={(value) =>
                  setMergeNoteOverrides((prev) =>
                    new Map(prev).set(reference.id, value),
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
