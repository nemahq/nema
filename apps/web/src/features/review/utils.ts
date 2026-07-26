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
// revert는 type 분기를 title==null 체크보다 먼저 본다. revert_changeset은 원본
// title을 그대로 상속하는데(접미사 없음, revert_changeset_depth 마이그레이션),
// 원본이 manual(예: archive_digest로 아카이브된 Digest를 restore_digest로 되살리는
// 경우)이면 title이 null로 상속된다 — 이때도 revertDepth만큼 revert_marker를 반복해
// "되돌림/Revert" 표식만은 남긴다(번호 자리표시자를 감싸는 형태로). type 체크를 뒤에
// 두면 이 경로가 통째로 무표식 자리표시자로 떨어져, 이 PR이 고치려던 "되돌리기
// 여부를 알 수 없음" 문제가 그대로 재현된다.
//
// ICU 복수형은 =1/other 두 갈래뿐이라 임의 depth 반복을 표현 못 해 JS에서 직접
// 겹친다 — 반복 자체(언어 무관)만 코드가 맡고, 어순(한글은 제목 뒤에 붙고 영문은
// git revert 컨벤션처럼 앞에 붙음)은 revert_title 템플릿이 언어별로 이미 쥐고 있다.
export function changesetDisplayTitle(
  entry: Pick<ChangesetListEntry, "title" | "number" | "type" | "revertDepth">,
  t: (
    key: TranslationKey,
    options?: CombinedOptions<DefaultParamType>,
  ) => string,
): string {
  if (entry.type === "revert") {
    const originalTitle =
      entry.title ??
      t("review.changeset_fallback_title", { number: entry.number });
    const marker = t("review.revert_marker");
    const markers = Array.from(
      { length: entry.revertDepth },
      () => marker,
    ).join(" ");
    return t("review.revert_title", { title: originalTitle, markers });
  }
  if (entry.title == null) {
    return t("review.changeset_fallback_title", { number: entry.number });
  }
  return entry.title;
}
