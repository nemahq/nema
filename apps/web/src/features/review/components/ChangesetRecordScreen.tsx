import { Suspense } from "react";
import { Link, linkOptions, useNavigate } from "@tanstack/react-router";

import { Badge, Button } from "@nema-io/weave";

import { changesetDisplayState } from "@web/features/review/constants";
import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useRestorePendingRelation } from "@web/features/review/hooks/useRestorePendingRelation";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";
import { useSpacePublicId } from "@web/hooks/useSpacePublicId";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { ChangesetRecordBody } from "./ChangesetRecordBody";

function ChangesetRecordContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const spacePublicId = useSpacePublicId();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [changesetDetail] = useChangesetDetailSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  const revertChangeset = useRevertChangeset();
  const restorePendingRelation = useRestorePendingRelation(
    spaceId,
    changesetNumber,
  );

  function handleRevert() {
    revertChangeset.mutate(
      { changesetId: changesetDetail.id },
      {
        onSuccess: ({ revertChangesetNumber }) => {
          navigate({
            to: "/space/$spacePublicId/changesets/$changesetNumber",
            params: {
              spacePublicId,
              changesetNumber: String(revertChangesetNumber),
            },
          });
        },
      },
    );
  }

  function handleRestore() {
    restorePendingRelation.mutate({ changesetId: changesetDetail.id });
  }

  function renderHeaderActions() {
    if (changesetDetail.outcome === "applied") {
      // 되돌리기 버튼은 "지금 그래프에 살아있는 걸 만든 행"에만 붙는다(review-flow.md
      // #26 규칙 4) — 이미 되돌려졌으면(reverted) 버튼 대신 그 direct revert
      // changeset(revertedByNumber)으로 가는 추적 링크를 상태 무관하게 계속 보여준다.
      if (
        changesetDetail.reverted &&
        changesetDetail.revertedByNumber !== null
      ) {
        return (
          <Button variant="neutral" className="shrink-0" asChild>
            <Link
              {...linkOptions({
                to: "/space/$spacePublicId/changesets/$changesetNumber",
                params: {
                  spacePublicId,
                  changesetNumber: String(changesetDetail.revertedByNumber),
                },
              })}
            >
              {t("review.detail_reverted_by_action", {
                number: changesetDetail.revertedByNumber,
              })}
            </Link>
          </Button>
        );
      }
      return (
        <Button
          variant="neutral"
          className="shrink-0"
          onClick={handleRevert}
          disabled={revertChangeset.isPending}
        >
          {t("review.detail_revert_action")}
        </Button>
      );
    }
    // 되살리기 RPC는 conflicts뿐 아니라 type='relation' discarded 전부를 대상으로
    // 하지만, duplicates·확신 관계는 판정 화면이 없어 되살려도 열 곳이 없다(open이
    // 되는 순간 관계 판정 화면이 NOT_FOUND로 막혀버림) — 그래서 conflicts로 좁힌다.
    // invalidatedById가 있으면(캐스케이드로 자동 닫힘) RPC가 애초에 거절하므로,
    // 버튼도 같은 조건으로 맞춰 "눌러도 절대 성공 못 하는" 버튼을 안 보여준다.
    if (
      changesetDetail.body.kind === "relation_conflict_discarded" &&
      changesetDetail.invalidatedById === null
    ) {
      return (
        <Button
          variant="neutral"
          className="shrink-0"
          onClick={handleRestore}
          disabled={restorePendingRelation.isPending}
        >
          {t("review.detail_restore_action")}
        </Button>
      );
    }
    return null;
  }

  const title = changesetDisplayTitle(changesetDetail, t);
  // 확신 자동 적용 배치는 목록 행과 같은 "연결 {count}" 총합을 헤더에 재사용한다
  // (카드별 breakdown이나 개수 제한은 만들지 않는다 — review-flow.md 관련 슬라이스).
  const confidentRelationCount =
    changesetDetail.body.kind === "relation_confident_applied"
      ? changesetDetail.body.relations.length
      : null;

  return (
    <ChangesetDetailLayout title={title}>
      <ChangesetDetailHeader
        title={title}
        changesetNumber={changesetDetail.number}
        state={changesetDisplayState(
          changesetDetail.status,
          changesetDetail.outcome,
          changesetDetail.number,
        )}
        badge={
          confidentRelationCount !== null ? (
            <Badge variant="outline" shape="pill" size="sm">
              {t("review.effect_relation", { count: confidentRelationCount })}
            </Badge>
          ) : undefined
        }
        time={changesetDetail.updatedAt}
        actions={renderHeaderActions()}
      />
      <ChangesetRecordBody changesetDetail={changesetDetail} />
    </ChangesetDetailLayout>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 changeset 상세만의 콘텐츠 쿼리(useChangesetDetailSuspenseQuery)
// 에 대한 Suspense만 책임진다.
export function ChangesetRecordScreen() {
  return (
    <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
      <ChangesetRecordContent />
    </Suspense>
  );
}
