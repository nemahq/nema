import type { RelationEndpointDetailSnapshot } from "@web/features/review/types";

import { DigestReadonlyCard } from "./DigestReadonlyCard";

interface RelationEndpointStackProps {
  // 위/아래 스택 순서일 뿐 승패를 뜻하지 않는다 — conflict의 from/to는 관계 엔진이
  // 감지 시점에 임의로 매긴 방향이라 승자가 항상 first인 게 아니다(승자는
  // resolve_conflict_relation의 별도 파라미터로 판정됨). duplicate만 first=keeper가
  // 보장된다(호출부가 keeper를 first로 넘김). 어느 쪽이 archived인지는 이 순서가
  // 아니라 각자의 statementStatus로 판정한다.
  first: RelationEndpointDetailSnapshot;
  second: RelationEndpointDetailSnapshot;
}

// 관계 판정 화면의 A·B 비교 카드를 얼려서 보여주는 자리 — 나란히 2열이 아니라
// 위아래로 스택한다(surface-inventory.md "Changeset 상세" 본문 레이아웃).
// relation_conflict_applied·relation_duplicate_applied·relation_confident_applied
// 셋이 전부 이 컴포넌트를 공유한다.
export function RelationEndpointStack({
  first,
  second,
}: RelationEndpointStackProps) {
  return (
    <div className="flex flex-col gap-4">
      <DigestReadonlyCard
        digest={first.digest}
        archived={first.statementStatus === "archived"}
      />
      <DigestReadonlyCard
        digest={second.digest}
        archived={second.statementStatus === "archived"}
      />
    </div>
  );
}
