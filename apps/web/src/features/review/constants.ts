import {
  DIGEST_TYPES,
  type DigestType,
  REFERENCE_TYPES,
  type ReferenceType,
} from "@nema-io/shared";
import type { BadgeVariant } from "@nema-io/weave";
import type { IconComponent } from "@nema-io/weave/icons";
import { Check, Circle, X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetStatus, ChangesetType } from "./types";

export const DIGEST_TYPE_LABEL: Record<DigestType, string> = {
  decision: "결정",
  pending: "미결",
  learning: "학습",
  idea: "아이디어",
  assumption: "가정",
};

// organization은 행위주체(법인·팀), product는 그 주체가 만든 것 — 라벨만 봐선
// 헷갈리는 구분이라 reference.ts SSOT 주석과 짝지어 둔다.
export const REFERENCE_TYPE_LABEL: Record<ReferenceType, string> = {
  person: "인물",
  organization: "조직",
  project: "프로젝트",
  product: "제품",
  term: "개념",
};

// Select의 onValueChange·서버가 준 문자열을 유니언으로 좁힌다 — `as` 없이(가드 없는
// 단언 금지, apps/web/docs/conventions.md) 값이 실제 판별자 집합에 드는지 확인한다.
export function isDigestType(value: string): value is DigestType {
  return DIGEST_TYPES.some((type) => type === value);
}

export function isReferenceType(value: string): value is ReferenceType {
  return REFERENCE_TYPES.some((type) => type === value);
}

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
// 라벨은 코드 타입명이 아니라 glossary 제품 용어를 그대로 쓴다 — ingestion=정리,
// relation=연결(glossary.md 매핑), revert는 대응 제품 용어가 없어 명사형으로 새로 정함.
export const CHANGESET_TYPE_LABEL: Record<
  Exclude<ChangesetType, "manual">,
  TranslationKey
> = {
  ingestion: "review.type_ingestion",
  relation: "review.type_relation",
  revert: "review.type_revert",
};

// changeset_status는 아직 pending/applied/rejected 셋뿐이다(status+outcome 2필드
// 모델은 07-modeling.md가 그리는 목표 스키마일 뿐 미구현) — "적용 안 하고 닫힘"을
// relation 도메인이 먼저 쓰던 rejected를 ingestion도 그대로 재사용한다
// (supabase/migrations/20260714130000_ingestion_review_discard_restore.sql 참고).
// relation의 거절도 지금은 되살리기가 없지만 후속으로 ingestion과 동일하게 열 예정이라
// (intervention-design.md §10 백로그), type별로 라벨을 나누지 않고 "버려짐"으로 통일한다.
const CHANGESET_STATUS_VARIANT: Record<ChangesetStatus, BadgeVariant> = {
  pending: "warning",
  applied: "success",
  rejected: "neutral",
};

const CHANGESET_STATUS_LABEL_KEY: Record<ChangesetStatus, TranslationKey> = {
  pending: "review.status_pending",
  applied: "review.status_applied",
  rejected: "review.status_discarded",
};

export function changesetStatusMeta(status: ChangesetStatus): {
  labelKey: TranslationKey;
  variant: BadgeVariant;
} {
  return {
    labelKey: CHANGESET_STATUS_LABEL_KEY[status],
    variant: CHANGESET_STATUS_VARIANT[status],
  };
}

// pending은 아직 진행 중이라 배경 없이 브랜드색 테두리(원 아이콘 자체)만 — applied·
// rejected는 결론이 난 것이라 배경을 채운 칩으로 더 무겁게 낸다. applied는 무채색
// 톤(Button primary 다크 배색)이라 pending의 브랜드 teal과 안 겹친다. rejected는
// 버려짐(ingestion)·거절됨(relation) 둘 다 같은 아이콘·라벨.
type ChangesetStatusIcon =
  | { kind: "outline"; Icon: IconComponent; tone: string }
  | { kind: "filled"; Icon: IconComponent; bg: string; iconTone: string };

export function changesetStatusIcon(
  status: ChangesetStatus,
): ChangesetStatusIcon {
  if (status === "pending") {
    return { kind: "outline", Icon: Circle, tone: "text-brand" };
  }
  if (status === "applied") {
    return {
      kind: "filled",
      Icon: Check,
      bg: "bg-fg-primary",
      iconTone: "text-surface-base",
    };
  }
  // fg-tertiary가 다크에서 더 밝아져(팔레트 stone-400) 흰 아이콘 대비가 떨어지므로
  // 다크에서만 아이콘을 어둡게(surface-base) 뒤집는다.
  return {
    kind: "filled",
    Icon: X,
    bg: "bg-fg-tertiary",
    iconTone: "text-white dark:text-surface-base",
  };
}
