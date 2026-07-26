import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ChangesetListEntry =
  RouterOutputs["changeset"]["listChangesets"]["changesets"][number];
export type ChangesetType = ChangesetListEntry["type"];
export type ChangesetStatus = ChangesetListEntry["status"];
export type ChangesetOutcome = ChangesetListEntry["outcome"];

// 값 집합이 ChangesetStatus와 같아진 건 우연이 아니다 — 서브탭이 정확히 그 축으로
// 필터링한다. 별개 유니언으로 두면 둘이 갈라져도 컴파일 에러로 안 드러난다.
export type ChangesSubTab = ChangesetStatus;

export type DigestReviewDetail = RouterOutputs["digestReview"]["get"];
export type ReviewDigest = DigestReviewDetail["digests"][number];
export type ReviewNewReference = DigestReviewDetail["newReferences"][number];
export type ReviewCitedReference =
  DigestReviewDetail["citedReferences"][number];
