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
  // 값 모양을 정의가 직접 들고 있는다 — 값을 보고 되짚으면 빈 필드에서 어느
  // 쪽인지 알 수 없다. option-list는 갈림길을 담는 칸(선택지·대안)으로, 항목마다
  // 선택지와 그 이유가 짝을 이룬다.
  kind: "text" | "list" | "option-list";
  labelKey: TranslationKey;
}

// 갈림길 항목의 이유 필드는 칸마다 이름이 다르다(대안은 왜 안 골랐나,
// 선택지는 그쪽 논거) — 읽는 쪽이 한 모양으로 다루도록 여기서 좁힌다.
interface DigestOptionEntry {
  option: string;
  detail?: string;
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
      kind: "option-list",
      labelKey: "digest.field_alternatives",
    },
  ],
  pending: [
    { key: "question", kind: "text", labelKey: "digest.field_question" },
    { key: "background", kind: "text", labelKey: "digest.field_background" },
    {
      key: "branches",
      kind: "option-list",
      labelKey: "digest.field_branches",
    },
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
export function readDigestBodyText(
  body: DigestBody,
  key: DigestBodyFieldKey,
): string | undefined {
  const raw: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (typeof raw !== "string" || raw.trim() === "") {
    return undefined;
  }
  return raw;
}

export function readDigestBodyList(
  body: DigestBody,
  key: DigestBodyFieldKey,
): string[] | undefined {
  const raw: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const filled = raw.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim() !== "",
  );
  return filled.length > 0 ? filled : undefined;
}

// 이유 필드 이름이 칸마다 달라(alternatives는 rejectionReason, branches는
// argument) 여기서 detail 하나로 좁힌다 — 렌더가 칸마다 분기하지 않게 한다.
export function readDigestBodyOptions(
  body: DigestBody,
  key: DigestBodyFieldKey,
): DigestOptionEntry[] | undefined {
  const raw: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const entries = raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const option = record.option;
    if (typeof option !== "string" || option.trim() === "") {
      return [];
    }
    const reason = record.rejectionReason ?? record.argument;
    const detail =
      typeof reason === "string" && reason.trim() !== "" ? reason : undefined;
    return [{ option, ...(detail !== undefined && { detail }) }];
  });
  return entries.length > 0 ? entries : undefined;
}

// idea·assumption은 원안(#B8862B, #4F8A5B)이 흰 글자 대비 4.5:1(상세 배지
// 라벨 기준 WCAG AA)에 못 미쳐(각각 3.24:1, 4.10:1) 그 색만 한 단계 낮췄다 —
// 다른 세 색은 원안 그대로다.
export const DIGEST_TYPE_COLOR: Record<DigestType, string> = {
  decision: "text-white bg-[#C0503C] ring-[#C0503C]",
  idea: "text-white bg-[#996F24] ring-[#996F24]",
  assumption: "text-white bg-[#4B8356] ring-[#4B8356]",
  learning: "text-white bg-[#3D7E96] ring-[#3D7E96]",
  pending: "text-white bg-[#7E5FA8] ring-[#7E5FA8]",
};
