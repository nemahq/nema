import type { ReactNode } from "react";

import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import type {
  ChangesetStatus,
  ChangesetType,
} from "@web/features/review/types";

import { ChangesetNotFound } from "./ChangesetNotFound";
import { ChangesetRecordScreen } from "./ChangesetRecordScreen";
import { IngestionScreen } from "./IngestionScreen";

type ChangesetDetailKind = "open" | "closed";

// status에 값이 추가되면 컴파일 에러로 드러나야, 조용히 closed로 잘못 분류되는 걸 막는다.
const CHANGESET_DETAIL_KIND: Record<ChangesetStatus, ChangesetDetailKind> = {
  pending: "open",
  applied: "closed",
  rejected: "closed",
};

// 컴포넌트가 아니라 렌더 함수를 담는다. 표에서 컴포넌트를 꺼내 반환하면 호출부가
// <Screen />으로 그리게 되는데, 함수가 반환한 값을 컴포넌트로 쓰면 React 컴파일러가
// "Cannot create components during render"로 막는다(모듈 상수를 직접 인덱싱할 때는
// 발화하지 않는다 — 함수 반환값이라 추적을 못 하는 것이다). 표가 ReactNode를 반환하면
// 호출부에 컴포넌트 자리가 생기지 않아 이 문제를 우회한다.
type RenderChangesetDetailScreen = () => ReactNode;

// 컴포넌트로 두는 이유는 번호를 훅으로 읽기 위해서다 — 표의 렌더 함수 안에서는 훅을
// 부를 수 없다. 던지면 상세 게이트의 ErrorBoundary가 잡아 Sentry까지 올린다.
function ImpossiblePendingChangeset(): ReactNode {
  const changesetNumber = useChangesetNumber();
  throw new Error(
    `changeset #${changesetNumber} is pending but its type never has a pending state`,
  );
}

// 편집 화면과 기록 화면을 하나로 합치지 않는 이유: 편집 중인 초안과 확정된 기록은
// 성격이 달라, 각자의 쿼리·상태를 그대로 유지하는 편이 낫다. 이 표는 어느 쪽을
// 보여줄지만 정한다.
//
// 같은 URL이 타입·상태에 따라 다른 화면을 그리는 건 GitHub의 PR 페이지(merge 여부와
// 무관하게 /pull/123 URL 그대로)를 참고한 것이다. 타입이 늘 때 이 표에 줄을 더하는
// 것으로 끝나도록 빈칸 없이 채운다(빠뜨리면 컴파일 에러).
const CHANGESET_DETAIL_SCREEN: Record<
  ChangesetType,
  Record<ChangesetDetailKind, RenderChangesetDetailScreen>
> = {
  ingestion: {
    open: () => <IngestionScreen />,
    closed: () => <ChangesetRecordScreen />,
  },
  // relation의 pending은 실제로 생성되지만 판정 모드가 아직 없다 — Digest 상세가
  // 맡을 예정이라(review-flow.md) 계획된 공백이고, 그래서 조용히 빈 화면을 낸다.
  relation: {
    open: () => <ChangesetNotFound />,
    closed: () => <ChangesetRecordScreen />,
  },
  // manual·revert는 생성 즉시 applied라 pending이 존재할 수 없다. 그런데 이 불변식을
  // 지키는 건 RPC 관례뿐이고 chk_changeset_shape는 status를 제약하지 않아, 백필이나
  // MCP 쓰기가 뚫으면 행이 실제로 생긴다. 그건 데이터 정합성이 깨졌다는 신호라
  // "찾을 수 없음"으로 덮지 않고 던져서 Sentry까지 올린다.
  manual: {
    open: () => <ImpossiblePendingChangeset />,
    // manual은 변경셋 목록에도 안 뜨고(listChangesets가 type != manual로 걸러냄),
    // "변경 이력" 모달(review-flow.md "수정 이력 항목 클릭 시 상세 확인")도 아직
    // 안 만들어져 이 화면으로 정상적으로 도달하는 경로가 없다 — URL을 직접 찍어도
    // 찾을 수 없음으로 막는다. 모달이 생기면 그 안에서 보여줄 몫이지 이 범용
    // Changeset 상세가 담당할 몫이 아니다.
    closed: () => <ChangesetNotFound />,
  },
  revert: {
    open: () => <ImpossiblePendingChangeset />,
    // TODO: revert도 무엇을 되돌렸는지 보여줘야 한다(review-flow.md "충돌 판정 되돌리기"
    // 등이 만드는 changeset이다). manual과 같은 임시 매핑이다.
    closed: () => <ChangesetRecordScreen />,
  },
};

export function renderChangesetDetailScreen(
  type: ChangesetType,
  status: ChangesetStatus,
): ReactNode {
  return CHANGESET_DETAIL_SCREEN[type][CHANGESET_DETAIL_KIND[status]]();
}
