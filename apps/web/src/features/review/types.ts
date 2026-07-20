import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ChangesetListEntry =
  RouterOutputs["changeset"]["listChangesets"]["changesets"][number];
export type ChangesetType = ChangesetListEntry["type"];
export type ChangesetStatus = ChangesetListEntry["status"];

export type ChangesSubTab = "open" | "closed";

export type DigestReviewDetail = RouterOutputs["digestReview"]["get"];
export type ReviewDigest = DigestReviewDetail["digests"][number];
export type ReviewNewReference = DigestReviewDetail["newReferences"][number];
export type ReviewCitedReference =
  DigestReviewDetail["citedReferences"][number];

// changeset 상세 화면(레지스트리가 고르는 타입별 화면)이 공통으로 받는 props.
// Space 식별자는 라우트에 있으므로 필요한 곳이 useSpacePublicId/useCurrentSpaceId로
// 직접 읽는다 — 게이트가 이미 Space 존재를 확인한 뒤라 그 훅들의 계약이 성립한다.
export interface ChangesetDetailScreenProps {
  changesetNumber: number;
}
