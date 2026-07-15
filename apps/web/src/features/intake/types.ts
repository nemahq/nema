import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

import type { DraftStatus } from "@web/features/intake/utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type PendingSourceItem =
  RouterOutputs["source"]["listPending"]["items"][number];

export interface DraftHeaderProps {
  sourceId: string;
  spaceId: string;
  title: string | null;
  createdAt: string;
}

// DraftsScreen이 목록(DraftList)과 사이드뷰(DetailPanel) 사이를 넘나들며 드는
// 선택된 초안의 데이터 모양 — 특정 컴포넌트에 속하지 않아 여기(types.ts)에 둔다.
// 컴포넌트 props 자체는 (컨벤션에 따라) 이 타입을 그대로 넘기지 않고 필드를
// 풀어서 받는다 — DraftCardProps/DraftDetailPanelProps 참고.
export interface DraftCardData {
  sourceId: string;
  spaceId: string;
  title: string | null;
  body: string;
  status: DraftStatus;
  createdAt: string;
}

// IdleDraftCard/WorkingDraftCard가 공유하는 primitive props — DraftCardData를
// 그대로 넘기지 않고 풀어 받는다(컴포넌트 데이터 props는 primitive여야 memo
// 얕은 비교가 유효하다는 컨벤션).
export interface DraftCardProps {
  sourceId: string;
  spaceId: string;
  title: string | null;
  body: string;
  status: DraftStatus;
  createdAt: string;
  onSelect: () => void;
}

// IdleDraftDetailPanel/WorkingDraftDetailPanel이 공유하는 primitive props —
// DraftsScreen이 둘 중 하나를 동적으로 골라 끼우므로(선택된 초안의 status로
// 분기) 두 컴포넌트의 prop 모양이 정확히 같아야 한다.
export interface DraftDetailPanelProps {
  sourceId: string;
  spaceId: string;
  title: string | null;
  body: string;
  status: DraftStatus;
  createdAt: string;
  onClose: () => void;
  // 리스트의 카드(예: 결과없음 상태 아이콘)가 "원문이 편집됐는지"를 반영해야 할 때 씀.
  onBodyDirtyChange?: (dirty: boolean) => void;
}
