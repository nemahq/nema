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

// title은 생성 시점에 채워져 대부분 있다(changeset_title 마이그레이션) — null이면
// 번호 기반 자리표시자로 대체한다. manual은 review-flow.md 결정상 title이 항상
// null이라 이 경로가 일상적으로 걸린다(Digest manual은 목록·상세에 실제로 노출되므로
// — manual_changeset_title_null 마이그레이션 주석 참고 — 자리표시자가 정상 경로다).
//
// revert는 더 이상 별도 분기가 없다 — "OO 되돌림" 조합(따옴표 감싸기 포함)은
// revert_changeset RPC 호출 전에 서버(changeset-service.ts composeRevertTitle)가
// UI 언어로 미리 완성해 저장하므로, revert 타입의 title도 다른 타입과 똑같이
// 이미 완성된 값이다(never null).
export function changesetDisplayTitle(
  entry: Pick<ChangesetListEntry, "title" | "number">,
  t: (
    key: TranslationKey,
    options?: CombinedOptions<DefaultParamType>,
  ) => string,
): string {
  if (entry.title == null) {
    return t("review.changeset_fallback_title", { number: entry.number });
  }
  return entry.title;
}
