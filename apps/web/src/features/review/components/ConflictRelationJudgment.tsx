import { useState } from "react";

import { Badge, LoadingGuard } from "@nema-io/weave";

import { toHighlightedFieldKey } from "@web/features/review/digestBodyFieldValue";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useRejectPendingRelation } from "@web/features/review/hooks/useRejectPendingRelation";
import { useResolveConflictRelation } from "@web/features/review/hooks/useResolveConflictRelation";
import type { RelationEndpointDetailSnapshot } from "@web/features/review/types";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetConfirmDiscardActions } from "./ChangesetConfirmDiscardActions";
import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
import { RelationJudgmentCard } from "./RelationJudgmentCard";
import { RelationJudgmentSourceTab } from "./RelationJudgmentSourceTab";

// A·B가 서로 다른 Source일 수 있어(IngestionScreen과 달리 하나의 공유 탭이 아님)
// 고정된 두 id로 각자 독립된 탭을 연다.
const SOURCE_TAB_A_ID = "tab-source-a";
const SOURCE_TAB_B_ID = "tab-source-b";

interface ConflictRelationJudgmentProps {
  title: string;
  createdAt: string;
  changesetId: string;
  from: RelationEndpointDetailSnapshot;
  to: RelationEndpointDetailSnapshot;
}

export function ConflictRelationJudgment({
  title,
  createdAt,
  changesetId,
  from,
  to,
}: ConflictRelationJudgmentProps) {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();

  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(
    null,
  );

  const resolveConflict = useResolveConflictRelation(spaceId, changesetNumber);
  const rejectPending = useRejectPendingRelation(spaceId, changesetNumber);
  // isPendingAfterDelay가 아니라 isPending — 그 250ms 지연 동안은 잠기지 않아,
  // 같은 버튼을 두 번 눌러 이미 닫힌 changeset에 재호출하는 경합이 생긴다.
  // 지연은 아래 discardPending(라벨 표시)·guardActive(Guard 표시)에만 쓴다.
  const locked = resolveConflict.isPending || rejectPending.isPending;
  const guardActive =
    resolveConflict.isPendingAfterDelay || rejectPending.isPendingAfterDelay;

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
      changesetId,
      winnerStatementId: selectedStatementId,
    });
  }

  function handleDiscard() {
    if (locked) {
      return;
    }
    rejectPending.mutate({ changesetId });
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
        changesetNumber={changesetNumber}
        state="open"
        badge={
          <Badge variant="outline" shape="pill" size="sm">
            {t("review.relation_judgment_conflict_badge")}
          </Badge>
        }
        time={createdAt}
        actions={
          <ChangesetConfirmDiscardActions
            onDiscard={handleDiscard}
            onConfirm={handleConfirm}
            discardPending={rejectPending.isPendingAfterDelay}
            confirmPending={resolveConflict.isPendingAfterDelay}
            discardDisabled={locked}
            confirmDisabled={locked || !selectedStatementId}
          />
        }
      />
      <div className="relative flex flex-col gap-4">
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
        <LoadingGuard active={guardActive} />
      </div>
    </ChangesetDetailLayout>
  );
}
