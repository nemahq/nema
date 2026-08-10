import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ReferenceSummary =
  RouterOutputs["reference"]["list"]["references"][number];
export type ReferenceDetail = RouterOutputs["reference"]["get"];
export type ReferenceTagSummary = ReferenceDetail["tags"][number];
export type ReferenceCitingDigest =
  RouterOutputs["reference"]["citingDigests"]["digests"][number];
