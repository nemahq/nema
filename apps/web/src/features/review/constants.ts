import {
  type DigestBody,
  type DigestType,
  REFERENCE_TYPES,
  type ReferenceType,
} from "@nema-io/shared";
import type { BadgeVariant } from "@nema-io/weave";
import type { IconComponent } from "@nema-io/weave/icons";
import { Check, Circle, X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetStatus, ChangesetType } from "./types";

export const DIGEST_TYPE_LABEL_KEY: Record<DigestType, TranslationKey> = {
  decision: "review.digest_type_decision",
  pending: "review.digest_type_pending",
  learning: "review.digest_type_learning",
  idea: "review.digest_type_idea",
  assumption: "review.digest_type_assumption",
};

export const DIGEST_TYPE_BADGE_VARIANT: Record<DigestType, BadgeVariant> = {
  decision: "digest-decision",
  pending: "digest-pending",
  learning: "digest-learning",
  idea: "digest-idea",
  assumption: "digest-assumption",
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
export function isReferenceType(value: string): value is ReferenceType {
  return REFERENCE_TYPES.some((type) => type === value);
}

// 07-modeling.md의 DigestBody 필드 정의 순서·한글 라벨을 그대로 따른다.
// key를 타입별 본문 필드로 좁혀, 없는 필드나 오타가 컴파일 에러로 드러나게 한다.
export type DigestBodyFieldKind = "text" | "list";

// 타입별로 갈리는 본문 필드 이름 전체 — body가 유니온이라 keyof를 그냥 쓰면
// 교집합("type")만 남으므로 분배해서 모은다. 오타나 없는 필드가 컴파일 에러로
// 드러나게 하는 게 목적이다.
type BodyFieldKeyOf<T> = T extends unknown ? Exclude<keyof T, "type"> : never;
export type DigestBodyFieldKey = BodyFieldKeyOf<DigestBody>;

interface DigestBodyFieldMeta<T extends DigestType> {
  key: Exclude<keyof Extract<DigestBody, { type: T }>, "type">;
  // 스키마상 string인지 string[]인지를 정의가 직접 들고 있는다 — 렌더가 값을 보고
  // 되짚으면 값이 비어있는 필드에서 어느 쪽인지 알 수 없다.
  kind: DigestBodyFieldKind;
  labelKey: TranslationKey;
  // 라벨은 "무슨 필드인지"만 말해줘서, 빈 필드에 뭘 적어야 할지는 별도 질문형
  // placeholder가 안내한다(design-decisions-log.md 참고) — 포커스됐을 때만
  // 노출해 리스트 필드에서 빈 줄마다 같은 문구가 반복되는 걸 피한다.
  placeholderKey: TranslationKey;
}

export const DIGEST_BODY_FIELDS: {
  [T in DigestType]: DigestBodyFieldMeta<T>[];
} = {
  decision: [
    {
      key: "situation",
      kind: "text",
      labelKey: "review.digest_field_situation",
      placeholderKey: "review.digest_field_situation_placeholder",
    },
    {
      key: "choice",
      kind: "text",
      labelKey: "review.digest_field_choice",
      placeholderKey: "review.digest_field_choice_placeholder",
    },
    {
      key: "reason",
      kind: "text",
      labelKey: "review.digest_field_reason",
      placeholderKey: "review.digest_field_reason_placeholder",
    },
    {
      key: "tradeoff",
      kind: "list",
      labelKey: "review.digest_field_tradeoff",
      placeholderKey: "review.digest_field_tradeoff_placeholder",
    },
    {
      key: "alternatives",
      kind: "list",
      labelKey: "review.digest_field_alternatives",
      placeholderKey: "review.digest_field_alternatives_placeholder",
    },
  ],
  pending: [
    {
      key: "question",
      kind: "text",
      labelKey: "review.digest_field_question",
      placeholderKey: "review.digest_field_question_placeholder",
    },
    {
      key: "background",
      kind: "text",
      labelKey: "review.digest_field_background",
      placeholderKey: "review.digest_field_background_placeholder",
    },
    {
      key: "branches",
      kind: "list",
      labelKey: "review.digest_field_branches",
      placeholderKey: "review.digest_field_branches_placeholder",
    },
    {
      key: "resolutionCondition",
      kind: "text",
      labelKey: "review.digest_field_resolution_condition",
      placeholderKey: "review.digest_field_resolution_condition_placeholder",
    },
  ],
  learning: [
    {
      key: "finding",
      kind: "text",
      labelKey: "review.digest_field_finding",
      placeholderKey: "review.digest_field_finding_placeholder",
    },
    {
      key: "evidence",
      kind: "text",
      labelKey: "review.digest_field_evidence",
      placeholderKey: "review.digest_field_evidence_placeholder",
    },
  ],
  idea: [
    {
      key: "concept",
      kind: "text",
      labelKey: "review.digest_field_concept",
      placeholderKey: "review.digest_field_concept_placeholder",
    },
    {
      key: "background",
      kind: "text",
      labelKey: "review.digest_field_background",
      placeholderKey: "review.digest_field_background_placeholder",
    },
    {
      key: "branches",
      kind: "list",
      labelKey: "review.digest_field_branches",
      placeholderKey: "review.digest_field_branches_placeholder",
    },
  ],
  assumption: [
    {
      key: "assumption",
      kind: "text",
      labelKey: "review.digest_field_assumption",
      placeholderKey: "review.digest_field_assumption_placeholder",
    },
    {
      key: "evidence",
      kind: "text",
      labelKey: "review.digest_field_evidence",
      placeholderKey: "review.digest_field_evidence_placeholder",
    },
    {
      key: "impact",
      kind: "text",
      labelKey: "review.digest_field_impact",
      placeholderKey: "review.digest_field_impact_placeholder",
    },
    {
      key: "verificationCondition",
      kind: "text",
      labelKey: "review.digest_field_verification_condition",
      placeholderKey: "review.digest_field_verification_condition_placeholder",
    },
  ],
};

// manual은 이 목록에 절대 안 나온다 — 확정 즉시 applied로 끝나 Space 오버뷰의
// Changes 탭 대신 각 Digest·Reference의 "변경 이력"에서만 노출된다(surface-inventory.md).
// 라벨은 이 changeset을 만든 AI 활동을 가리킨다(결과물 개념어가 아님) — ingestion=정리,
// relation=발견. "연결"(glossary.md의 Relation 개념어)은 사용자가 먼저 겪는 접점이
// 없고 충돌류 관계엔 안 맞아, AI가 스스로 알아챘다는 뜻의 "발견"으로 바꿨다.
// revert는 대응 제품 용어가 없어 명사형으로 새로 정함.
const CHANGESET_TYPE_LABEL: Record<
  Exclude<ChangesetType, "manual">,
  TranslationKey
> = {
  ingestion: "review.type_ingestion",
  relation: "review.type_relation",
  revert: "review.type_revert",
};

interface ChangesetRowTypeSlots {
  // revert는 배지를 안 낸다 — 제목 자체가 "{원본 제목} 되돌림"으로 이미 되돌리기임을
  // 말해줘서, 배지까지 얹으면 같은 정보의 중복 신호가 된다.
  badgeLabelKey: TranslationKey | null;
  // ingestion만 digest·reference 카운트가 의미 있는 effect를 갖는다
  // (summarizeChangesetEffect 주석 참고) — 나머지 타입은 요약을 안 낸다.
  showsEffectSummary: boolean;
}

// manual은 이 목록에 구조적으로 안 뜨지만(위 CHANGESET_TYPE_LABEL 주석), 타입이
// 늘 때 이 표를 안 채우면 컴파일 에러로 드러나야 해서 방어적으로 원소를 채워 넣는다.
export const CHANGESET_ROW_TYPE_SLOTS: Record<
  ChangesetType,
  ChangesetRowTypeSlots
> = {
  ingestion: {
    badgeLabelKey: CHANGESET_TYPE_LABEL.ingestion,
    showsEffectSummary: true,
  },
  relation: {
    badgeLabelKey: CHANGESET_TYPE_LABEL.relation,
    showsEffectSummary: false,
  },
  revert: { badgeLabelKey: null, showsEffectSummary: false },
  manual: { badgeLabelKey: null, showsEffectSummary: false },
};

// changeset_status는 아직 pending/applied/rejected 셋뿐이다(status+outcome 2필드
// 모델은 07-modeling.md가 그리는 목표 스키마일 뿐 미구현) — "적용 안 하고 닫힘"을
// relation 도메인이 먼저 쓰던 rejected를 ingestion도 그대로 재사용한다
// (supabase/migrations/20260714130000_ingestion_review_discard_restore.sql 참고).
// relation의 거절도 지금은 되살리기가 없지만 후속으로 ingestion과 동일하게 열 예정이라
// (intervention-design.md §10 백로그), type별로 라벨을 나누지 않고 "반려됨"으로 통일한다.
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
// ingestion·relation 둘 다 "반려됨"으로 같은 아이콘·라벨.
export type ChangesetStatusIcon =
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
