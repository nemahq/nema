import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetListEntry } from "./types";

const EFFECT_LABEL_KEY: Record<string, TranslationKey> = {
  statement: "review.effect_statement",
  relation: "review.effect_relation",
  source: "review.effect_source",
  digest: "review.effect_digest",
  reference: "review.effect_reference",
};

// Changeset.title이 아직 스키마에 없어(design-decisions-log 참고) 대체 표기로 쓴다 —
// sourceTitle이 있는 ingestion은 changesetDisplayTitle이 이 함수보다 그 값을 우선한다.
// non-ingestion(sourceTitle 없음)이나 아직 추출 중인 ingestion만 이 폴백을 그대로 본다.
function summarizeChangesetEffect(
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

export function changesetDisplayTitle(
  entry: Pick<ChangesetListEntry, "sourceTitle" | "effect">,
  t: (key: TranslationKey) => string,
): string {
  return entry.sourceTitle ?? summarizeChangesetEffect(entry.effect, t);
}
