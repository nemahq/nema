import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetListEntry } from "./types";

const EFFECT_LABEL_KEY: Record<string, TranslationKey> = {
  statement: "review.effect_statement",
  relation: "review.effect_relation",
  source: "review.effect_source",
  digest: "review.effect_digest",
  reference: "review.effect_reference",
};

// Changeset.title이 아직 스키마에 없어(design-decisions-log 참고) 목록 행의 임시
// 대체 표기로 쓴다 — title 컬럼이 생기면 이 호출부를 그 값으로 바꾸면 된다.
export function summarizeChangesetEffect(
  effect: ChangesetListEntry["effect"],
  t: (key: TranslationKey) => string,
): string {
  const parts = Object.entries(effect)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => {
      const key = EFFECT_LABEL_KEY[type];
      return `${key ? t(key) : type} ${count}`;
    });
  return parts.length > 0 ? parts.join(" · ") : t("review.effect_none");
}
