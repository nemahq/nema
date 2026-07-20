import type { ReactNode } from "react";

import type {
  ChangesetDetailScreenProps,
  ChangesetStatus,
  ChangesetType,
} from "@web/features/review/types";

import { ChangesetNotFound } from "./ChangesetNotFound";
import { ChangesetRecordScreen } from "./ChangesetRecordScreen";
import { IngestionReviewScreen } from "./IngestionReviewScreen";

type ChangesetDetailKind = "open" | "closed";

// status에 값이 추가되면 컴파일 에러로 드러나야, 조용히 closed로 잘못 분류되는 걸 막는다.
const CHANGESET_DETAIL_KIND: Record<ChangesetStatus, ChangesetDetailKind> = {
  pending: "open",
  applied: "closed",
  rejected: "closed",
};

// 컴포넌트가 아니라 렌더 함수를 담는다 — 표에서 컴포넌트를 꺼내 <Screen />으로 그리면
// React 컴파일러가 "매 렌더마다 새 컴포넌트일 수 있다"며 막는다(상태 초기화 위험).
// 요소 타입을 이 표 안에서 고정하면 그 위험 자체가 사라진다.
type RenderChangesetDetailScreen = (
  props: ChangesetDetailScreenProps,
) => ReactNode;

// GitHub의 PR 페이지(merge 여부와 무관하게 /pull/123 URL 그대로)를 참고한 패턴 —
// 같은 URL이 타입·상태에 따라 다른 화면을 그린다. 타입이 늘 때 이 표에 줄을 더하는
// 것으로 끝나도록 두 축을 모두 Record로 채운다(빠뜨리면 컴파일 에러).
//
// open 화면이 있는 타입은 ingestion뿐이다. manual·revert는 생성 즉시 applied라 open
// 상태 자체가 없고, relation의 판정 모드는 Digest 상세가 맡을 예정이라(review-flow.md)
// 아직 이 표면에 없다 — 서버도 digestReview.get에서 type='ingestion'을 막는다.
const CHANGESET_DETAIL_SCREEN: Record<
  ChangesetType,
  Record<ChangesetDetailKind, RenderChangesetDetailScreen>
> = {
  ingestion: {
    open: (props) => <IngestionReviewScreen {...props} />,
    closed: (props) => <ChangesetRecordScreen {...props} />,
  },
  relation: {
    open: () => <ChangesetNotFound />,
    closed: (props) => <ChangesetRecordScreen {...props} />,
  },
  manual: {
    open: () => <ChangesetNotFound />,
    closed: (props) => <ChangesetRecordScreen {...props} />,
  },
  revert: {
    open: () => <ChangesetNotFound />,
    closed: (props) => <ChangesetRecordScreen {...props} />,
  },
};

export function renderChangesetDetailScreen(
  type: ChangesetType,
  status: ChangesetStatus,
  props: ChangesetDetailScreenProps,
): ReactNode {
  return CHANGESET_DETAIL_SCREEN[type][CHANGESET_DETAIL_KIND[status]](props);
}
