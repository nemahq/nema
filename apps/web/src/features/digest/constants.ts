import type { Digest, DigestType } from "@nema-io/shared";
import type { IconComponent } from "@nema-io/weave/icons";
import {
  Flag,
  FlaskConical,
  Hourglass,
  Lightbulb,
  Telescope,
} from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";

// legacy/apps/web/src/features/review/constants.ts DIGEST_TYPE_ICON과 동일 매핑 —
// 다이제스트 유형은 화면에 상관없이 같은 시각 언어를 쓴다. Check는 드롭다운
// 선택 표시로 이미 쓰이고 있어 제외했고, HelpCircle류(물음표)는 안내·도움말
// 아이콘으로 통용돼 헷갈릴 여지가 있어 pending에는 안 썼다.
export const DIGEST_TYPE_ICON: Record<DigestType, IconComponent> = {
  decision: Flag,
  pending: Hourglass,
  learning: Telescope,
  idea: Lightbulb,
  assumption: FlaskConical,
};

export const DIGEST_TYPE_LABEL_KEY: Record<DigestType, TranslationKey> = {
  decision: "digest.type_decision",
  pending: "digest.type_pending",
  learning: "digest.type_learning",
  idea: "digest.type_idea",
  assumption: "digest.type_assumption",
};

type DigestBody = Digest["body"];

// body가 유형별 유니온이라 keyof를 그냥 쓰면 교집합만 남는다 — 분배해서 모아야
// 없는 필드나 오타가 컴파일 에러로 드러난다.
type BodyFieldKeyOf<T> = T extends unknown ? keyof T : never;
type DigestBodyFieldKey = BodyFieldKeyOf<DigestBody>;

interface DigestBodyFieldMeta<T extends DigestType> {
  key: keyof Extract<Digest, { type: T }>["body"];
  // string인지 string[]인지를 정의가 직접 들고 있는다 — 값을 보고 되짚으면
  // 빈 필드에서 어느 쪽인지 알 수 없다.
  kind: "text" | "list";
  labelKey: TranslationKey;
}

// 칸 순서·라벨은 legacy review 화면과 같게 맞춘다 — 같은 다이제스트를 화면마다
// 다른 순서로 읽히게 하지 않는다.
export const DIGEST_BODY_FIELDS: {
  [T in DigestType]: DigestBodyFieldMeta<T>[];
} = {
  decision: [
    { key: "situation", kind: "text", labelKey: "digest.field_situation" },
    { key: "choice", kind: "text", labelKey: "digest.field_choice" },
    { key: "reason", kind: "text", labelKey: "digest.field_reason" },
    { key: "tradeoff", kind: "list", labelKey: "digest.field_tradeoff" },
    {
      key: "alternatives",
      kind: "list",
      labelKey: "digest.field_alternatives",
    },
  ],
  pending: [
    { key: "question", kind: "text", labelKey: "digest.field_question" },
    { key: "background", kind: "text", labelKey: "digest.field_background" },
    { key: "branches", kind: "list", labelKey: "digest.field_branches" },
    {
      key: "resolutionCondition",
      kind: "text",
      labelKey: "digest.field_resolution_condition",
    },
  ],
  learning: [
    { key: "finding", kind: "text", labelKey: "digest.field_finding" },
    { key: "evidence", kind: "text", labelKey: "digest.field_evidence" },
  ],
  idea: [
    { key: "concept", kind: "text", labelKey: "digest.field_concept" },
    { key: "background", kind: "text", labelKey: "digest.field_background" },
    { key: "branches", kind: "list", labelKey: "digest.field_branches" },
  ],
  assumption: [
    { key: "assumption", kind: "text", labelKey: "digest.field_assumption" },
    { key: "evidence", kind: "text", labelKey: "digest.field_evidence" },
    { key: "impact", kind: "text", labelKey: "digest.field_impact" },
    {
      key: "verificationCondition",
      kind: "text",
      labelKey: "digest.field_verification_condition",
    },
  ],
};

// DIGEST_BODY_FIELDS의 key는 렌더 시점에 body.type과의 상관관계가 끊겨 string으로
// 넓어진다 — 단언 대신 실제 값 모양을 확인해 좁힌다.
export function readDigestBodyField(
  body: DigestBody,
  key: DigestBodyFieldKey,
): string | string[] | undefined {
  const raw: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (typeof raw === "string") {
    return raw.trim() === "" ? undefined : raw;
  }
  if (Array.isArray(raw) && raw.every((entry) => typeof entry === "string")) {
    const filled = raw.filter((entry) => entry.trim() !== "");
    return filled.length > 0 ? filled : undefined;
  }
  return undefined;
}
