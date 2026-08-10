import type { CombinedOptions, DefaultParamType } from "@tolgee/web";

import type { TranslationKey } from "@web/lib/tolgee";

import type { ChangesetDisplayState } from "./constants";
import type { ChangesetListEntry, ChangesetType } from "./types";

type Translate = (
  key: TranslationKey,
  options?: CombinedOptions<DefaultParamType>,
) => string;

// 행 2줄에 상시 노출하는 diffstat성 요약 — "무엇에 대한 리뷰인가"(제목)와 별개로
// "이게 얼마나 큰 리뷰인가"를 스캔 시점에 미리 가늠하게 한다. ingestion은
// digest·reference만(statement는 별도 비동기 파이프라인), relation은 확신 자동
// 적용 배치일 때만 relation이 0보다 크다(changesetShowsEffectSummary가 그 외
// 케이스는 아예 호출을 막는다) — 같은 changeset에서 세 필드가 동시에 0보다 큰
// 경우는 없지만, 셋을 한 함수에 두면 표시 포맷("라벨 {count}"·구분자 " · ")을
// 한 곳에서만 관리할 수 있다.
export function summarizeChangesetEffect(
  effect: Pick<
    ChangesetListEntry["effect"],
    "digest" | "reference" | "relation"
  >,
  t: Translate,
): string | null {
  const parts = [
    effect.digest > 0 && t("review.effect_digest", { count: effect.digest }),
    effect.reference > 0 &&
      t("review.effect_reference", { count: effect.reference }),
    effect.relation > 0 &&
      t("review.effect_relation", { count: effect.relation }),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

// 행에 붙는 "연/닫은 주체" 한 조각 — open이면 이 changeset을 연 주체, closed면
// 판정을 내려 닫은 주체(review-flow.md 관련 슬라이스). ingestion·relation은
// 엔진 산물이라 open일 때 항상 AI. revert는 보통 사람이 되돌리기 버튼을 눌러
// 열지만, revert_changeset SQL은 auth.uid() IS NULL(시스템/서비스 트리거)도
// 허용하므로 그 경로에서는 authorName이 NULL일 수 있다 — 그래서 아래 ?? aiLabel
// 폴백이 존재한다. closed면 closedByName이 있으면 그 이름, 없으면 AI가 판정을
// 낸 것이다(closedById만 보면 계정 삭제와 헷갈린다 — closedByName의 NULL 여부로만
// 판단).
export function changesetRowAuthorLabel(args: {
  type: ChangesetType;
  state: ChangesetDisplayState;
  authorName: string | null;
  closedByName: string | null;
  t: Translate;
}): string {
  const { type, state, authorName, closedByName, t } = args;
  const aiLabel = t("review.author_ai");
  if (state === "open") {
    return type === "revert" ? (authorName ?? aiLabel) : aiLabel;
  }
  return closedByName ?? aiLabel;
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
