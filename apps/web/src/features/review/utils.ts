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
// revert는 저장된 title이 원본 그대로라(접미사 없음, revert_changeset_depth
// 마이그레이션), revertDepth를 얹어 ICU 복수형 키로 언어별 문구를 조합한다.
export function changesetDisplayTitle(
  entry: Pick<ChangesetListEntry, "title" | "number" | "type" | "revertDepth">,
  t: (
    key: TranslationKey,
    options?: CombinedOptions<DefaultParamType>,
  ) => string,
): string {
  if (entry.title == null) {
    return t("review.changeset_fallback_title", { number: entry.number });
  }
  if (entry.type === "revert") {
    return t("review.revert_title", {
      title: entry.title,
      depth: entry.revertDepth,
    });
  }
  return entry.title;
}
