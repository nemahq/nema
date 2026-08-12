import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@nema-io/server/src/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type SourceSummary = RouterOutputs["source"]["list"]["sources"][number];
export type SourceDetail = RouterOutputs["source"]["get"];
export type SourceStatement = SourceDetail["statements"][number];
type StatementGroup = RouterOutputs["statement"]["search"]["groups"][number];
export type SearchedStatement = StatementGroup["statements"][number];

// 표식은 상대 진술 ID만 실려온다(content 없음) — 본문은 같은 검색 결과 안에서만 매칭 가능
export type RelationMarkers = Pick<
  SearchedStatement,
  "supersededBy" | "conflictsWith" | "resolvedBy"
>;

export type PendingSourceItem =
  RouterOutputs["source"]["listPending"]["items"][number];
export type DigestReviewDetail = RouterOutputs["digestReview"]["get"];
export type ReviewDigest = DigestReviewDetail["digests"][number];
export type NarrationEvidence = RouterOutputs["narration"]["evidence"];

export type PendingRelation =
  RouterOutputs["changeset"]["listPendingRelations"]["proposals"][number];
export type ChangesetHistoryEntry =
  RouterOutputs["changeset"]["listChangesets"]["changesets"][number];
export type ActiveRelation =
  RouterOutputs["changeset"]["listActiveRelations"]["relations"][number];
export type RelationType = ActiveRelation["type"];

export type ReferenceSummary =
  RouterOutputs["reference"]["list"]["references"][number];

type ModelPresetInfo = RouterOutputs["dev"]["getModelPreset"];
export type ModelPresetName = ModelPresetInfo["preset"];
type TaskModels = RouterOutputs["dev"]["getTaskModels"];
export type ModelCatalogEntry = TaskModels["catalog"][number];
export type LlmTaskName = keyof TaskModels["overrides"];
