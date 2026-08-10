import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type PendingSourceItem =
  RouterOutputs["source"]["listPending"]["items"][number];

// 카드 헤더(Idle/Working)가 공유하는 primitive props — 목록 카드는 Space를
// 보여주지 않는다(상세 클릭 한 번이면 되는 만큼 카드는 제목·시각만 남긴다).
export interface DraftHeaderProps {
  sourceId: string;
  title: string | null;
  createdAt: string;
}
