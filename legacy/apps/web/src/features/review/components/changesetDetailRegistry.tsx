import type { ReactNode } from "react";
import { Suspense } from "react";

import { useChangesetDetailSuspenseQuery } from "@web/features/review/hooks/useChangesetDetailQuery";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import type {
  ChangesetStatus,
  ChangesetType,
} from "@web/features/review/types";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";

import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { ChangesetNotFound } from "./ChangesetNotFound";
import { ChangesetRecordScreen } from "./ChangesetRecordScreen";
import { IngestionScreen } from "./IngestionScreen";
import { RelationJudgmentScreen } from "./RelationJudgmentScreen";

// 컴포넌트가 아니라 렌더 함수를 담는다. 표에서 컴포넌트를 꺼내 반환하면 호출부가
// <Screen />으로 그리게 되는데, 함수가 반환한 값을 컴포넌트로 쓰면 React 컴파일러가
// "Cannot create components during render"로 막는다(모듈 상수를 직접 인덱싱할 때는
// 발화하지 않는다 — 함수 반환값이라 추적을 못 하는 것이다). 표가 ReactNode를 반환하면
// 호출부에 컴포넌트 자리가 생기지 않아 이 문제를 우회한다.
type RenderChangesetDetailScreen = () => ReactNode;

// 컴포넌트로 두는 이유는 번호를 훅으로 읽기 위해서다 — 표의 렌더 함수 안에서는 훅을
// 부를 수 없다. 던지면 상세 게이트의 ErrorBoundary가 잡아 Sentry까지 올린다.
function ImpossibleOpenChangeset(): ReactNode {
  const changesetNumber = useChangesetNumber();
  throw new Error(
    `changeset #${changesetNumber} is open but its type never has an open state`,
  );
}

// revert.open은 되돌린 대상이 ingestion이었는지 relation 판정(충돌·중복)이었는지에
// 따라 재판정 화면이 갈린다 — 그 판정(reopenShape)은 getChangesetByNumber가 changes의
// 실제 모양으로 이미 계산해 내려준다(classifyReopenShape, 서버와 같은 판정 로직).
// IngestionScreen/RelationJudgmentScreen 둘 다 spaceId+number만으로 자기 데이터를
// 새로 구독해(digestReview.get/getPendingRelationByNumber, 둘 다 type IN
// ('ingestion'|'relation', 'revert') 가드) 그대로 재사용된다 — 이 화면 전용 로직은
// 필요 없다. revert_changeset RPC가 status='open'을 reopenShape가 있을 때만 만들므로
// (v_reopen_kind IS NOT NULL) null은 구조적으로 불가능한 상태다.
function RevertReopenContent(): ReactNode {
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [changesetDetail] = useChangesetDetailSuspenseQuery(
    spaceId,
    changesetNumber,
  );
  if (changesetDetail.body.kind !== "revert") {
    throw new Error(
      `changeset #${changesetNumber} is type='revert' but its detail body isn't`,
    );
  }
  const { reopenShape } = changesetDetail.body;
  if (reopenShape === "ingestion") {
    return <IngestionScreen />;
  }
  if (reopenShape === "relation_judgment") {
    return <RelationJudgmentScreen />;
  }
  throw new Error(
    `changeset #${changesetNumber} is an open revert changeset with no reopen shape`,
  );
}

// useChangesetDetailSuspenseQuery는 사실 여기서 다시 suspend하지 않는다 —
// ChangesetDetailRouter(부모, ChangesetDetailScreen.tsx)가 같은 쿼리 키로 이미 fetch를
// 마친 뒤에만 이 화면이 그려지므로 캐시 히트다. 그래도 이 파일 안에서 훅을 직접 호출하는
// 이상 진짜 로딩 경로(첫 mount 경합 등)에 대한 방어로 Suspense를 co-locate한다
// (nema/require-suspense-boundary).
function RevertReopenScreen(): ReactNode {
  return (
    <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
      <RevertReopenContent />
    </Suspense>
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
  Record<ChangesetStatus, RenderChangesetDetailScreen>
> = {
  ingestion: {
    open: () => <IngestionScreen />,
    closed: () => <ChangesetRecordScreen />,
  },
  relation: {
    open: () => <RelationJudgmentScreen />,
    closed: () => <ChangesetRecordScreen />,
  },
  // manual은 생성 즉시 closed+applied라 open이 존재할 수 없다. 그런데 이 불변식을
  // 지키는 건 RPC 관례뿐이고 chk_changeset_shape는 status를 제약하지 않아, 백필이나
  // MCP 쓰기가 뚫으면 행이 실제로 생긴다. 그건 데이터 정합성이 깨졌다는 신호라
  // "찾을 수 없음"으로 덮지 않고 던져서 Sentry까지 올린다(revert와 달리 manual의
  // open은 여전히 그 자체로 불변식 위반이다).
  manual: {
    open: () => <ImpossibleOpenChangeset />,
    // manual은 변경셋 목록에도 안 뜨고(listChangesets가 type != manual로 걸러냄),
    // "변경 이력" 모달(review-flow.md "수정 이력 항목 클릭 시 상세 확인")도 아직
    // 안 만들어져 이 화면으로 정상적으로 도달하는 경로가 없다 — URL을 직접 찍어도
    // 찾을 수 없음으로 막는다. 모달이 생기면 그 안에서 보여줄 몫이지 이 범용
    // Changeset 상세가 담당할 몫이 아니다.
    closed: () => <ChangesetNotFound />,
  },
  // revert의 open은 ingestion/relation(충돌·중복 판정) 되돌리기가 재판정 초안으로
  // 여는, 정상적으로 도달 가능한 상태다(백엔드 revert_changeset 재설계 참고) — 어느
  // 재판정 화면인지는 RevertReopenScreen이 changes의 실제 모양으로 갈라 보낸다.
  revert: {
    open: () => <RevertReopenScreen />,
    closed: () => <ChangesetRecordScreen />,
  },
};

export function renderChangesetDetailScreen(
  type: ChangesetType,
  status: ChangesetStatus,
): ReactNode {
  return CHANGESET_DETAIL_SCREEN[type][status]();
}
