import { useRef, useState } from "react";

import type { DigestDraft } from "@nema-io/shared";
import { Alert, Badge, Text } from "@nema-io/weave";

import { toHighlightedFieldKey } from "@web/features/review/digestBodyFieldValue";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useFieldCommitRegistry } from "@web/features/review/hooks/useFieldCommitRegistry";
import { useRejectPendingRelation } from "@web/features/review/hooks/useRejectPendingRelation";
import { useResolveDuplicateRelation } from "@web/features/review/hooks/useResolveDuplicateRelation";
import { mergeDraftConfirmDisabledReason } from "@web/features/review/mergeDraftConfirmDisabledReason";
import type { RelationEndpointDetailSnapshot } from "@web/features/review/types";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetConfirmDiscardActions } from "./ChangesetConfirmDiscardActions";
import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { DigestReadonlyCard } from "./DigestReadonlyCard";
import { MergeProposalCard } from "./MergeProposalCard";

const CONFIRM_DISABLED_REASON_KEY = {
  missing_title: "review.relation_merge_confirm_disabled_missing_title",
  missing_description:
    "review.relation_merge_confirm_disabled_missing_description",
} as const;

interface DuplicateMergeJudgmentProps {
  title: string;
  reviewerName: string | null;
  createdAt: string;
  changesetId: string;
  keeper: RelationEndpointDetailSnapshot;
  duplicate: RelationEndpointDetailSnapshot;
  mergeDraft: DigestDraft | null;
}

// 관계 판정 화면(중복/병합) — surface-inventory.md "관계 판정 화면(중복/병합)".
// conflicts 판정(ConflictRelationJudgment, 읽기 전용 카드 중 하나를 고름)과 트리거는
// 같지만 결과가 근본적으로 달라(고르기가 아니라 병합) 별도 컴포넌트로 분리했다.
export function DuplicateMergeJudgment({
  title,
  reviewerName,
  createdAt,
  changesetId,
  keeper,
  duplicate,
  mergeDraft,
}: DuplicateMergeJudgmentProps) {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();

  // 병합 제안 제목이 헤더 제목을 그대로 따라간다(surface-inventory.md "헤더 제목은
  // 읽기 전용 — 실제 편집은 병합 제안 카드의 제목 입력 하나뿐") — 이 로컬 상태를
  // 헤더와 카드 양쪽에 같이 물려 하나의 값으로 동기화한다. 초안이 없으면(LLM 실패)
  // 편집 대상 자체가 없어 changeset 제목(A vs B 폴백)을 그대로 보여준다.
  const [draft, setDraft] = useState<DigestDraft | null>(mergeDraft);
  // setDraft는 다음 렌더에야 반영돼, 확정 클릭 시점에 방금 flush된 최신 값을
  // 동기적으로 읽을 방법이 없다 — draftRef를 나란히 두고 항상 최신값을 읽는다
  // (useBufferedValue의 latestRef, ReviewDraftProvider의 updateReviewRef와 같은 결).
  const draftRef = useRef(draft);
  function handleChangeDraft(next: DigestDraft) {
    draftRef.current = next;
    setDraft(next);
  }
  const headingTitle = draft?.title || title;

  const { registerPendingCommit, flushPendingCommits } =
    useFieldCommitRegistry();

  const resolveDuplicate = useResolveDuplicateRelation(
    spaceId,
    changesetNumber,
  );
  const rejectPending = useRejectPendingRelation(spaceId, changesetNumber);
  const locked = resolveDuplicate.isPending || rejectPending.isPending;

  const confirmDisabledReasonCode = mergeDraftConfirmDisabledReason(draft);
  const confirmDisabled = locked || confirmDisabledReasonCode !== null;
  // no_draft는 이미 아래 안내 카드가 전담하므로, 여기서는 제목/설명이 빈 경우에만
  // 별도 경고를 보여준다 — 같은 상태를 두 군데서 중복 안내하지 않는다.
  const confirmDisabledReasonText =
    draft &&
    confirmDisabledReasonCode &&
    confirmDisabledReasonCode !== "no_draft"
      ? t(CONFIRM_DISABLED_REASON_KEY[confirmDisabledReasonCode])
      : null;

  function handleConfirm() {
    if (confirmDisabled) {
      return;
    }
    // 확정 버튼 클릭이 포커스 필드를 항상 blur시키는 건 아니다 — flush 후
    // draftRef에서 최신값을 다시 읽어 방금 친 값을 놓치지 않는다.
    flushPendingCommits();
    const latestDraft = draftRef.current;
    if (!latestDraft || mergeDraftConfirmDisabledReason(latestDraft) !== null) {
      return;
    }
    resolveDuplicate.mutate({ changesetId, mergedDigest: latestDraft });
  }

  function handleDiscard() {
    if (locked) {
      return;
    }
    rejectPending.mutate({ changesetId });
  }

  return (
    <ChangesetDetailLayout title={headingTitle}>
      <ChangesetDetailHeader
        title={headingTitle}
        changesetNumber={changesetNumber}
        state="open"
        badge={
          <Badge variant="outline" shape="pill" size="sm">
            {t("review.relation_merge_duplicate_badge")}
          </Badge>
        }
        reviewerName={reviewerName}
        time={createdAt}
        actions={
          <ChangesetConfirmDiscardActions
            onDiscard={handleDiscard}
            onConfirm={handleConfirm}
            discardPending={rejectPending.isPendingAfterDelay}
            discardDisabled={locked}
            confirmDisabled={confirmDisabled}
          />
        }
      />
      {confirmDisabledReasonText && (
        <Alert variant="warning">{confirmDisabledReasonText}</Alert>
      )}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Text as="p" size="sm" color="tertiary">
            {t("review.relation_merge_proposal_label")}
          </Text>
          {draft ? (
            <MergeProposalCard
              draft={draft}
              disabled={locked}
              onChange={handleChangeDraft}
              registerPendingCommit={registerPendingCommit}
            />
          ) : (
            <div className="rounded-lg border border-border p-4">
              <Text as="p" size="base" weight="medium">
                {t("review.relation_merge_draft_unavailable_title")}
              </Text>
              <Text as="p" size="sm" color="tertiary">
                {t("review.relation_merge_draft_unavailable_description")}
              </Text>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Text as="p" size="base" weight="semibold">
            {t("review.relation_merge_originals_label")}
          </Text>
          <div className="rounded-lg border border-border p-4">
            <DigestReadonlyCard
              digest={keeper.digest}
              highlightedFieldKey={toHighlightedFieldKey(keeper.sourceField)}
              highlightedFieldIndex={keeper.sourceFieldIndex ?? undefined}
            />
          </div>
          <div className="rounded-lg border border-border p-4">
            <DigestReadonlyCard
              digest={duplicate.digest}
              highlightedFieldKey={toHighlightedFieldKey(duplicate.sourceField)}
              highlightedFieldIndex={duplicate.sourceFieldIndex ?? undefined}
            />
          </div>
        </div>
      </div>
    </ChangesetDetailLayout>
  );
}
