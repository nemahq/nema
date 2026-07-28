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

export type ChangesetDetail = RouterOutputs["changeset"]["getByNumber"];
type ChangesetDetailBody = ChangesetDetail["body"];

// K를 실제 kind 리터럴로 제약해둔다 — BE가 kind 이름을 바꾸거나 지우면 Extract만
// 썼을 때는 조용히 never로 저하되지만, 이 별칭을 쓰는 호출부는 그 자리에서 바로
// 컴파일 에러가 난다(tsc로 실측: kind 하나를 지워보면 즉시 에러).
type BodyOfKind<K extends ChangesetDetailBody["kind"]> = Extract<
  ChangesetDetailBody,
  { kind: K }
>;

export type DigestDetailSnapshot =
  BodyOfKind<"ingestion_applied">["digests"][number];
export type RelationEndpointDetailSnapshot =
  BodyOfKind<"relation_conflict_applied">["from"];
export type ChangesetConfidentRelationSnapshot =
  BodyOfKind<"relation_confident_applied">["relations"][number];
