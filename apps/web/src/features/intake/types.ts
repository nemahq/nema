import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

import type { DraftStatus } from "@web/features/intake/utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type PendingSourceItem =
  RouterOutputs["source"]["listPending"]["items"][number];

export interface DraftFooterProps {
  sourceId: string;
  spaceId: string;
  title: string | null;
  createdAt: string;
}

// 카드 컴포넌트(WorkingDraftCard/IdleDraftCard)를 넘나들며 쓰이는 공용 데이터
// 모양 — 특정 컴포넌트에 속하지 않아 여기(types.ts)에 둔다.
export interface DraftCardData {
  sourceId: string;
  spaceId: string;
  title: string | null;
  body: string;
  status: DraftStatus;
  createdAt: string;
}
