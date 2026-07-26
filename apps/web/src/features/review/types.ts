import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ChangesetListEntry =
  RouterOutputs["changeset"]["listChangesets"]["changesets"][number];
export type ChangesetType = ChangesetListEntry["type"];
export type ChangesetStatus = ChangesetListEntry["status"];
export type ChangesetOutcome = ChangesetListEntry["outcome"];

export type ChangesSubTab = "open" | "closed";

export type DigestReviewDetail = RouterOutputs["digestReview"]["get"];
export type ReviewDigest = DigestReviewDetail["digests"][number];
export type ReviewNewReference = DigestReviewDetail["newReferences"][number];
export type ReviewCitedReference =
  DigestReviewDetail["citedReferences"][number];
