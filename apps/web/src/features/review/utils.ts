import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetListEntry } from "./types";

// 행 2줄에 상시 노출하는 diffstat성 요약 — "무엇에 대한 리뷰인가"(제목)와 별개로
// "이게 얼마나 큰 리뷰인가"를 스캔 시점에 미리 가늠하게 한다. digest·reference만
// 다룬다 — ingestion의 changes는 구조적으로 이 둘만 0보다 클 수 있고(statement는
// 별도 비동기 파이프라인, relation은 별도 changeset), relation 타입 자체의 요약은
// 아직 범위 밖이라 나머지 필드는 코드에 아예 안 들인다.
export function summarizeChangesetEffect(
  effect: Pick<ChangesetListEntry["effect"], "digest" | "reference">,
  t: (key: TranslationKey) => string,
): string | null {
  const parts = [
    effect.digest > 0 && `${effect.digest} ${t("review.effect_digest")}`,
    effect.reference > 0 &&
      `${effect.reference} ${t("review.effect_reference")}`,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
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
