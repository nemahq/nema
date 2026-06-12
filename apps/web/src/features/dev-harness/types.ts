import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type SourceSummary = RouterOutputs["source"]["list"]["sources"][number];
export type SourceDetail = RouterOutputs["source"]["get"];
export type SourceStatement = SourceDetail["statements"][number];
export type StatementGroup =
  RouterOutputs["statement"]["search"]["groups"][number];
