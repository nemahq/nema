import { Suspense, useState } from "react";

import { Badge } from "@nema-io/weave";

import { toHighlightedFieldKey } from "@web/features/review/digestBodyFieldValue";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { usePendingRelationSuspenseQuery } from "@web/features/review/hooks/usePendingRelationQuery";
import { useRejectPendingRelation } from "@web/features/review/hooks/useRejectPendingRelation";
import { useResolveConflictRelation } from "@web/features/review/hooks/useResolveConflictRelation";
import type { RelationEndpointDetailSnapshot } from "@web/features/review/types";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetConfirmDiscardActions } from "./ChangesetConfirmDiscardActions";
import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
import { RelationJudgmentCard } from "./RelationJudgmentCard";
import { RelationJudgmentSourceTab } from "./RelationJudgmentSourceTab";

// A·B가 서로 다른 Source일 수 있어(IngestionScreen과 달리 하나의 공유 탭이 아님)
// 고정된 두 id로 각자 독립된 탭을 연다.
const SOURCE_TAB_A_ID = "tab-source-a";
const SOURCE_TAB_B_ID = "tab-source-b";

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
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();

  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(
    null,
  );

  const resolveConflict = useResolveConflictRelation(spaceId, changesetNumber);
  const rejectPending = useRejectPendingRelation(spaceId, changesetNumber);
  // isPendingAfterDelay가 아니라 isPending — 그 250ms 지연 동안은 잠기지 않아,
  // 같은 버튼을 두 번 눌러 이미 닫힌 changeset에 재호출하는 경합이 생긴다.
  // 지연은 아래 discardPending(라벨 표시)에만 쓴다.
  const locked = resolveConflict.isPending || rejectPending.isPending;

  const title = changesetDisplayTitle(changesetDetail, t);
  const { from, to } = pendingRelation.body;

  function handleSelect(statementId: string) {
    if (locked) {
      return;
    }
    setSelectedStatementId(statementId);
  }

  function handleConfirm() {
    if (locked || !selectedStatementId) {
      return;
    }
    resolveConflict.mutate({
      changesetId: pendingRelation.changesetId,
      winnerStatementId: selectedStatementId,
    });
  }

  function handleDiscard() {
    if (locked) {
      return;
    }
    rejectPending.mutate({ changesetId: pendingRelation.changesetId });
  }

  function handleViewSource(
    tabId: string,
    endpoint: RelationEndpointDetailSnapshot,
  ) {
    if (activeTabId === tabId) {
      closeTab(tabId);
      return;
    }
    openTab({
      id: tabId,
      label: endpoint.digest.title,
      content: (
        <RelationJudgmentSourceTab
          sourceId={endpoint.digest.sourceId}
          fallbackTitle={endpoint.digest.title}
        />
      ),
    });
  }

  return (
    <ChangesetDetailLayout title={title}>
      <ChangesetDetailHeader
        title={title}
        changesetNumber={pendingRelation.changesetNumber}
        state="open"
        badge={
          <Badge variant="outline" shape="pill" size="sm">
            {t("review.relation_judgment_conflict_badge")}
          </Badge>
        }
        reviewerName={pendingRelation.reviewerName}
        time={pendingRelation.createdAt}
        actions={
          <ChangesetConfirmDiscardActions
            onDiscard={handleDiscard}
            onConfirm={handleConfirm}
            discardPending={rejectPending.isPendingAfterDelay}
            discardDisabled={locked}
            confirmDisabled={locked || !selectedStatementId}
          />
        }
      />
      <div className="flex flex-col gap-4">
        <RelationJudgmentCard
          digest={from.digest}
          highlightedFieldKey={toHighlightedFieldKey(from.sourceField)}
          highlightedFieldIndex={from.sourceFieldIndex ?? undefined}
          selected={selectedStatementId === from.statementId}
          onSelect={() => handleSelect(from.statementId)}
          sourceActive={activeTabId === SOURCE_TAB_A_ID}
          onViewSource={() => handleViewSource(SOURCE_TAB_A_ID, from)}
          disabled={locked}
        />
        <RelationJudgmentCard
          digest={to.digest}
          highlightedFieldKey={toHighlightedFieldKey(to.sourceField)}
          highlightedFieldIndex={to.sourceFieldIndex ?? undefined}
          selected={selectedStatementId === to.statementId}
          onSelect={() => handleSelect(to.statementId)}
          sourceActive={activeTabId === SOURCE_TAB_B_ID}
          onViewSource={() => handleViewSource(SOURCE_TAB_B_ID, to)}
          disabled={locked}
        />
      </div>
    </ChangesetDetailLayout>
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
