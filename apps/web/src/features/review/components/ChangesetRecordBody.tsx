import { Text } from "@nema-io/weave";

import type { ChangesetDetail } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetRevertSummary } from "./ChangesetRevertSummary";
import { DigestReadonlyCardList } from "./DigestReadonlyCardList";
import { RelationEndpointStack } from "./RelationEndpointStack";

interface ChangesetRecordBodyProps {
  changesetDetail: ChangesetDetail;
}

// kind가 늘 때 이 switch에 줄을 더하는 것으로 끝나도록 빈칸 없이 채운다 —
// changesetDetailRegistry.tsx의 타입별 표와 같은 원칙(빠뜨리면 컴파일 에러).
function assertUnreachable(kind: never): never {
  throw new Error(`unhandled changeset detail body kind: ${String(kind)}`);
}

export function ChangesetRecordBody({
  changesetDetail,
}: ChangesetRecordBodyProps) {
  const { t } = useTranslation();
  const { body } = changesetDetail;

  switch (body.kind) {
    case "ingestion_applied":
      return <DigestReadonlyCardList digests={body.digests} />;
    // discarded 셋 다 되돌릴 대상 자체가 없었다는 뜻이라, 헤더의 상태 배지("버려짐")
    // 자체가 이미 완결된 설명이다 — 본문에 안내문을 반복하지 않는다.
    case "ingestion_discarded":
    case "relation_conflict_discarded":
    case "relation_duplicate_discarded":
      return null;
    case "relation_conflict_applied":
      return <RelationEndpointStack first={body.from} second={body.to} />;
    case "relation_duplicate_applied":
      return (
        <RelationEndpointStack first={body.keeper} second={body.duplicate} />
      );
    case "relation_confident_applied":
      return <RelationEndpointStack first={body.from} second={body.to} />;
    case "revert":
      return (
        <ChangesetRevertSummary
          revertsNumber={requireRevertsNumber(changesetDetail)}
        />
      );
    case "unsupported":
      return <Text color="tertiary">{t("review.detail_generic_body")}</Text>;
    default:
      return assertUnreachable(body);
  }
}

// revert 타입은 항상 reverts_id를 갖고 생성되므로 revertsNumber도 항상 채워진다
// (changeset-detail-service.ts) — null이면 그 불변식이 깨진 것이라 조용히 숨기지
// 않고 던진다.
function requireRevertsNumber(changesetDetail: ChangesetDetail): number {
  if (changesetDetail.revertsNumber === null) {
    throw new Error(
      `revert changeset ${changesetDetail.id} has no revertsNumber`,
    );
  }
  return changesetDetail.revertsNumber;
}
