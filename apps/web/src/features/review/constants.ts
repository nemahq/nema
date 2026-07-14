import type { DigestType } from "@nema-io/shared";
import type { BadgeVariant } from "@nema-io/weave";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetStatus, ChangesetType } from "./types";

export const DIGEST_TYPE_LABEL: Record<DigestType, string> = {
  decision: "결정",
  pending: "미결",
  learning: "학습",
  idea: "아이디어",
  assumption: "가정",
};

// 07-modeling.md의 DigestBody 필드 정의 순서·한글 라벨을 그대로 따른다.
interface DigestBodyFieldMeta {
  key: string;
  label: string;
}

export const DIGEST_BODY_FIELDS: Record<DigestType, DigestBodyFieldMeta[]> = {
  decision: [
    { key: "situation", label: "상황" },
    { key: "choice", label: "선택" },
    { key: "reason", label: "이유" },
    { key: "tradeoff", label: "트레이드오프" },
    { key: "alternatives", label: "대안" },
  ],
  pending: [
    { key: "question", label: "질문" },
    { key: "background", label: "배경" },
    { key: "branches", label: "갈래" },
    { key: "resolutionCondition", label: "해소 조건" },
  ],
  learning: [
    { key: "finding", label: "발견" },
    { key: "evidence", label: "근거" },
  ],
  idea: [
    { key: "concept", label: "발상" },
    { key: "background", label: "배경" },
    { key: "branches", label: "갈래" },
  ],
  assumption: [
    { key: "assumption", label: "가정 내용" },
    { key: "evidence", label: "근거" },
    { key: "impact", label: "영향" },
    { key: "verificationCondition", label: "검증 조건" },
  ],
};

// manual은 이 목록에 절대 안 나온다 — 확정 즉시 applied로 끝나 Space 오버뷰의
// Changes 탭 대신 각 Digest·Reference의 "변경 이력"에서만 노출된다(surface-inventory.md).
export const CHANGESET_TYPE_LABEL: Record<
  Exclude<ChangesetType, "manual">,
  string
> = {
  ingestion: "ingestion",
  relation: "relation",
  revert: "revert",
};

// changeset_status는 아직 pending/applied/rejected 셋뿐이다(status+outcome 2필드
// 모델은 07-modeling.md가 그리는 목표 스키마일 뿐 미구현) — "적용 안 하고 닫힘"을
// relation 도메인이 먼저 쓰던 rejected를 ingestion도 그대로 재사용한다
// (supabase/migrations/20260714130000_ingestion_review_discard_restore.sql 참고).
export const CHANGESET_STATUS_META: Record<
  ChangesetStatus,
  { labelKey: TranslationKey; variant: BadgeVariant }
> = {
  pending: { labelKey: "review.status_pending", variant: "warning" },
  applied: { labelKey: "review.status_applied", variant: "success" },
  rejected: { labelKey: "review.status_discarded", variant: "neutral" },
};

export function isOpenChangeset(status: ChangesetStatus): boolean {
  return status === "pending";
}
