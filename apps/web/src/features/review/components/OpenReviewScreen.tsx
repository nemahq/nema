import { Suspense, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Skeleton } from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useNotificationSoftAsk } from "@web/features/notifications";
import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import { useDigestReviewSuspenseQuery } from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import {
  buildMergeRows,
  toReferenceUpdates,
} from "@web/features/review/referenceMerge";
import type {
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
  const updateReview = useUpdateReview(changesetId);
  const confirmReview = useConfirmReview();
  const discardReview = useDiscardReview();
  const showNotificationSoftAsk = useNotificationSoftAsk();

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
  const CONFIRM_DISABLED_REASON_KEY = {
    no_candidates: "review.confirm_disabled_no_candidates",
    missing_title: "review.confirm_disabled_missing_title",
    empty_label: "review.confirm_disabled_empty_label",
    empty_reference: "review.confirm_disabled_empty_reference",
  } as const;
  const confirmDisabledReasonText =
    confirmDisabledReasonCode &&
    t(CONFIRM_DISABLED_REASON_KEY[confirmDisabledReasonCode]);

  // 확정·버리기로 changeset이 닫히면 이 화면(open 전용)은 유효하지 않게 되므로,
  // 처리 결과의 정본 위치인 ClosedReviewScreen(변경사항 상세)으로 곧바로 넘긴다.
  function goToClosedReview() {
    navigate({
      to: "/space/$spacePublicId/changesets/$changesetId",
      params: { spacePublicId, changesetId },
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
    <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-8">
        <header className="flex flex-col gap-2 border-b border-border/50 pb-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="flex min-w-0 items-baseline gap-2 text-2xl font-semibold text-fg-primary">
              <span className="min-w-0 truncate">
                {review.sourceTitle ?? t("review.digest_review_title")}
              </span>
              <span className="shrink-0 text-lg font-normal text-fg-tertiary">
                #{review.changesetNumber}
              </span>
            </h1>
            <ReviewHeaderActions
              onDiscard={handleDiscard}
              onConfirm={handleConfirm}
              discardPending={discardReview.isPendingAfterDelay}
              discardDisabled={locked}
              confirmDisabled={confirmDisabled}
            />
          </div>
          <div className="flex items-center gap-2">
            <ChangesetStatusBadge status="pending" />
            <RelativeTime
              dateTime={review.sourceCreatedAt}
              className="text-sm leading-none"
            />
          </div>
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
        <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-8">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </main>
      }
    >
      <OpenReviewContent {...props} />
    </Suspense>
  );
}
