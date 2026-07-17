import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetListEntry } from "./types";

const EFFECT_LABEL_KEY: Record<string, TranslationKey> = {
  statement: "review.effect_statement",
  relation: "review.effect_relation",
  source: "review.effect_source",
  digest: "review.effect_digest",
  reference: "review.effect_reference",
};

// effect 요약 문구 — 행에 상시 노출할 자리가 아직 안 정해져서(별도 논의 중)
// 지금은 아무 데도 안 쓰이지만, 그 자리가 정해지면 바로 재사용하도록 남겨둔다.
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

// Changeset.title이 아직 스키마에 없어(design-decisions-log 참고) 대체 표기로 쓴다 —
// sourceTitle이 있으면 그 값을 우선하고, 없으면(non-ingestion이거나 아직 제목 생성
// 전인 ingestion) effect 요약 대신 번호만 있는 정직한 자리표시자를 보여준다.
export function changesetDisplayTitle(
  entry: Pick<ChangesetListEntry, "sourceTitle" | "number">,
  t: (key: TranslationKey, options?: Record<string, string | number>) => string,
): string {
  return (
    entry.sourceTitle ??
    t("review.changeset_fallback_title", { number: entry.number })
  );
}

// authorId가 있는 changeset은 현재 워크스페이스가 단일 유저뿐이라 항상 조회자
// 본인이다(멀티유저 확장 시 authorId → 표시 이름 조회가 별도로 필요해진다).
export function changesetAuthorLabel(
  authorId: string | null,
  currentUserDisplayName: string,
  t: (key: TranslationKey) => string,
): string {
  return authorId === null ? t("review.author_engine") : currentUserDisplayName;
}
