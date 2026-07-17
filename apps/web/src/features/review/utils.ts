import type { CombinedOptions, DefaultParamType } from "@tolgee/web";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetListEntry } from "./types";

// 행 2줄에 상시 노출하는 diffstat성 요약 — "무엇에 대한 리뷰인가"(제목)와 별개로
// "이게 얼마나 큰 리뷰인가"를 스캔 시점에 미리 가늠하게 한다. digest·reference만
// 다룬다 — ingestion의 changes는 구조적으로 이 둘만 0보다 클 수 있고(statement는
// 별도 비동기 파이프라인, relation은 별도 changeset), relation 타입 자체의 요약은
// 아직 범위 밖이라 나머지 필드는 코드에 아예 안 들인다.
export function summarizeChangesetEffect(
  effect: Pick<ChangesetListEntry["effect"], "digest" | "reference">,
  t: (
    key: TranslationKey,
    options?: CombinedOptions<DefaultParamType>,
  ) => string,
): string | null {
  const parts = [
    effect.digest > 0 && t("review.effect_digest", { count: effect.digest }),
    effect.reference > 0 &&
      t("review.effect_reference", { count: effect.reference }),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

// title은 생성 시점에 채워져 거의 항상 있다(changeset_title 마이그레이션) — null인
// 극히 드문 경우(예: 아직 채워지지 않은 대상)에만 번호 기반 자리표시자로 대체한다.
export function changesetDisplayTitle(
  entry: Pick<ChangesetListEntry, "title" | "number">,
  t: (
    key: TranslationKey,
    options?: CombinedOptions<DefaultParamType>,
  ) => string,
): string {
  return (
    entry.title ??
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
  return authorId === null ? t("app.title") : currentUserDisplayName;
}
