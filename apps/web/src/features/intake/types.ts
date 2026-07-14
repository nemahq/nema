import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type PendingSourceItem =
  RouterOutputs["source"]["listPending"]["items"][number];

export interface DraftFooterProps {
  sourceId: string;
  spaceId: string;
  createdAt: string;
}
