import * as Sentry from "@sentry/react";

import { Text } from "@nema-io/weave";

import type { ChangesetDetail } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetRevertSummary } from "./ChangesetRevertSummary";
import { ConfidentRelationList } from "./ConfidentRelationList";
import { DigestReadonlyCardList } from "./DigestReadonlyCardList";
import { ReferenceReadonlySection } from "./ReferenceReadonlySection";
import { RelationEndpointStack } from "./RelationEndpointStack";

interface ChangesetRecordBodyProps {
  changesetDetail: ChangesetDetail;
}

export function ChangesetRecordBody({
  changesetDetail,
}: ChangesetRecordBodyProps) {
  const { t } = useTranslation();
  const { body } = changesetDetail;

  switch (body.kind) {
    case "ingestion_applied":
      return (
        <>
          <DigestReadonlyCardList digests={body.digests} />
          <ReferenceReadonlySection
            newReferences={body.newReferences}
            mergedReferences={body.mergedReferences}
          />
        </>
      );
    // discarded 넷 다 되돌릴 대상 자체가 없었다는 뜻이라, 헤더의 상태 배지("버려짐")
    // 자체가 이미 완결된 설명이다 — 본문에 안내문을 반복하지 않는다.
    case "ingestion_discarded":
    case "relation_conflict_discarded":
    case "relation_duplicate_discarded":
    case "relation_confident_discarded":
      return null;
    case "relation_conflict_applied":
      return (
        <RelationEndpointStack
          first={body.from}
          second={body.to}
          archivedBadgeCause="replaced"
        />
      );
    case "relation_duplicate_applied":
      return (
        <RelationEndpointStack
          first={body.keeper}
          second={body.duplicate}
          archivedBadgeCause="merged"
        />
      );
    case "relation_confident_applied":
      return <ConfidentRelationList relations={body.relations} />;
    case "revert":
      return <ChangesetRevertSummary revertsNumber={body.revertsNumber} />;
    case "unsupported":
      return <Text color="tertiary">{t("review.detail_generic_body")}</Text>;
    default: {
      // 컴파일 타임엔 body가 never라 kind가 늘 때 이 switch에 줄을 더하지 않으면
      // 여기서 타입 에러로 드러난다(changesetDetailRegistry.tsx의 타입별 표와 같은
      // 원칙). 그런데 서버·클라이언트는 독립 배포라, 배포 스큐 중엔 서버가 이미
      // 내보내는 새 kind를 아직 낡은 클라이언트가 만날 수 있다 — 그 순간엔 실제로
      // unreachable이 아니므로, 페이지 전체를 던져 죽이는 대신 unsupported와 같은
      // 안내로 조용히 낮추고 Sentry에만 남긴다. kind는 진단용으로만 읽으므로
      // unknown을 경유해 좁힌다.
      const unexpectedBody = body as unknown as { kind: string };
      Sentry.captureMessage("unhandled changeset detail body kind", {
        level: "warning",
        extra: { kind: unexpectedBody.kind },
      });
      return <Text color="tertiary">{t("review.detail_generic_body")}</Text>;
    }
  }
}
