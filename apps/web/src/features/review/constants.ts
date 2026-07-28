import {
  type DigestBody,
  type DigestType,
  REFERENCE_TYPES,
  type ReferenceType,
  type RelationType,
} from "@nema-io/shared";
import type { BadgeVariant, TagColor } from "@nema-io/weave";
import type { IconComponent } from "@nema-io/weave/icons";
import { Check, Circle, X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetOutcome, ChangesetStatus, ChangesetType } from "./types";

export const DIGEST_TYPE_LABEL_KEY: Record<DigestType, TranslationKey> = {
  decision: "review.digest_type_decision",
  pending: "review.digest_type_pending",
  learning: "review.digest_type_learning",
  idea: "review.digest_type_idea",
  assumption: "review.digest_type_assumption",
};

// relation_confident_applied는 사람 판정(conflict/duplicate)과 카드 모양이 같아
// 구분이 안 되므로, 어떤 관계로 자동 연결됐는지 최소한의 캡션으로 드러낸다.
export const CONFIDENT_RELATION_TYPE_LABEL_KEY: Record<
  Extract<RelationType, "supports" | "replaces" | "resolves">,
  TranslationKey
> = {
  supports: "review.relation_type_supports",
  replaces: "review.relation_type_replaces",
  resolves: "review.relation_type_resolves",
};

// weave는 색조만 알고 그게 무엇을 가리키는지는 모른다 — Digest 타입을 어느 색에
// 앉힐지는 이 표가 정한다(apps/web/src/index.css의 mode-* 매핑과 같은 결). 색을
// 바꾸는 것도 타입이 느는 것도 여기서 끝나고 디자인 시스템은 안 흔들린다. TagColor는
// 원래 사용자 태그용(해시로 자동 배정)이지만, Chip이 받는 색 축이 이거 하나뿐이라
// 타입마다 하나씩 고정 배정해 재사용한다.
export const DIGEST_TYPE_TAG_COLOR: Record<DigestType, TagColor> = {
  decision: "violet",
  pending: "rose",
  learning: "sage",
  idea: "olive",
  assumption: "mauve",
};

// organization은 행위주체(법인·팀), product는 그 주체가 만든 것 — 라벨만 봐선
// 헷갈리는 구분이라 reference.ts SSOT 주석과 짝지어 둔다.
export const REFERENCE_TYPE_LABEL_KEY: Record<ReferenceType, TranslationKey> = {
  person: "review.reference_type_person",
  organization: "review.reference_type_organization",
  project: "review.reference_type_project",
  product: "review.reference_type_product",
  term: "review.reference_type_term",
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

const ALL_DIGEST_BODY_FIELD_KEYS = new Set<string>(
  Object.values(DIGEST_BODY_FIELDS).flatMap((fields) =>
    fields.map((field) => field.key),
  ),
);

export function isDigestBodyFieldKey(
  value: string,
): value is DigestBodyFieldKey {
  return ALL_DIGEST_BODY_FIELD_KEYS.has(value);
}

// manual은 이 목록에 절대 안 나온다 — 확정 즉시 closed+applied로 끝나 Space 오버뷰의
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

// 배지·아이콘이 구분하는 건 셋뿐이다 — 열려 있음 / 적용됨 / 버려짐. status와
// outcome을 화면마다 따로 들고 다니며 조합하면 "closed인데 outcome이 뭐였더라"를
// 컴포넌트 수만큼 반복하게 되므로, 여기서 한 번만 접어 이 값으로 넘긴다.
export type ChangesetDisplayState = "open" | "applied" | "discarded";

export function changesetDisplayState(
  status: ChangesetStatus,
  outcome: ChangesetOutcome,
  // Sentry 캡처에서 어떤 changeset이 정합성을 어겼는지 짚을 수 있게, 호출부가 쥔
  // 식별자(number·id 등)를 그대로 실어 보낸다.
  identifier?: string | number,
): ChangesetDisplayState {
  if (status === "open") {
    return "open";
  }
  if (outcome === null) {
    // closed면 outcome이 반드시 있다(DB chk_changeset_outcome) — 없다는 건 데이터
    // 정합성이 깨졌다는 뜻이라 한쪽으로 조용히 넘기지 않고 던져서 Sentry까지 올린다.
    throw new Error(
      `changeset ${identifier ?? "(no identifier)"} is closed but has no outcome`,
    );
  }
  return outcome;
}

// discarded는 "적용 안 하고 닫혔다"는 한 상태를 ingestion(사람이 리뷰를 버림)과
// relation(사람이 제안을 거절함)이 공유한다(07-modeling.md Changeset.outcome) —
// 이유는 달라도 사용자가 보는 결과는 같아서 type별로 라벨을 나누지 않는다.
const CHANGESET_STATE_VARIANT: Record<ChangesetDisplayState, BadgeVariant> = {
  open: "warning",
  applied: "success",
  discarded: "neutral",
};

const CHANGESET_STATE_LABEL_KEY: Record<ChangesetDisplayState, TranslationKey> =
  {
    open: "review.status_pending",
    applied: "review.status_applied",
    discarded: "review.status_discarded",
  };

export function changesetStateMeta(state: ChangesetDisplayState): {
  labelKey: TranslationKey;
  variant: BadgeVariant;
} {
  return {
    labelKey: CHANGESET_STATE_LABEL_KEY[state],
    variant: CHANGESET_STATE_VARIANT[state],
  };
}

// open은 아직 진행 중이라 배경 없이 브랜드색 테두리(원 아이콘 자체)만 — applied·
// discarded는 결론이 난 것이라 배경을 채운 칩으로 더 무겁게 낸다. applied는 무채색
// 톤(Button primary 다크 배색)이라 open의 브랜드 teal과 안 겹친다.
export type ChangesetStateIcon =
  | { kind: "outline"; Icon: IconComponent; tone: string }
  | { kind: "filled"; Icon: IconComponent; bg: string; iconTone: string };

const CHANGESET_STATE_ICON: Record<ChangesetDisplayState, ChangesetStateIcon> =
  {
    open: { kind: "outline", Icon: Circle, tone: "text-brand" },
    applied: {
      kind: "filled",
      Icon: Check,
      bg: "bg-fg-primary",
      iconTone: "text-surface-base",
    },
    discarded: {
      kind: "filled",
      Icon: X,
      bg: "bg-fg-tertiary",
      // fg-tertiary가 다크에서 더 밝아져(팔레트 stone-400) 흰 아이콘 대비가 떨어지므로
      // 다크에서만 아이콘을 어둡게(surface-base) 뒤집는다.
      iconTone: "text-white dark:text-surface-base",
    },
  };

export function changesetStateIcon(
  state: ChangesetDisplayState,
): ChangesetStateIcon {
  return CHANGESET_STATE_ICON[state];
}
