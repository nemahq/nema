import { Badge } from "@nema-io/weave";

import {
  CONFIDENT_RELATION_ARCHIVED_BADGE_CAUSE,
  CONFIDENT_RELATION_TYPE_LABEL_KEY,
} from "@web/features/review/constants";
import type { ChangesetConfidentRelationSnapshot } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { RelationEndpointStack } from "./RelationEndpointStack";

interface ConfidentRelationListProps {
  relations: ChangesetConfidentRelationSnapshot[];
}

// apply_relation_changesets는 배치당 changeset 1개에 성공한 확신 관계마다 change
// 행을 쌓는다(conflict/duplicate처럼 쌍 하나=changeset 하나가 아니다) — 하나만
// 그리면 나머지는 화면에서 조용히 사라지므로 항상 전부 그린다.
export function ConfidentRelationList({
  relations,
}: ConfidentRelationListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {relations.map((relation) => (
        <RelationEndpointStack
          key={`${relation.from.statementId}-${relation.to.statementId}`}
          first={relation.from}
          second={relation.to}
          archivedBadgeCause={
            CONFIDENT_RELATION_ARCHIVED_BADGE_CAUSE[relation.relationType]
          }
          caption={
            <Badge variant="outline" shape="pill" size="sm" className="w-fit">
              {t(CONFIDENT_RELATION_TYPE_LABEL_KEY[relation.relationType])}
            </Badge>
          }
        />
      ))}
    </div>
  );
}
