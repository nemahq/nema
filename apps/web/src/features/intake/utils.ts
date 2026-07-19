import type { PendingSourceItem } from "@web/features/intake/types";

// 타입 별칭이 아니라 서버 응답 타입에서 직접 뽑아쓴다(PendingSourceItem["digestionOutcome"])
// — 값 집합을 여기 따로 옮겨 적으면 서버가 값을 추가했을 때 이 파일이 안 넓어져 도로
// out of sync 날 수 있다. 단, 이 파생 자체가 소비처의 exhaustiveness를 보장하진 않는다 —
// switch/Record로 모든 값을 실제로 처리하는 소비처(예: dev-harness의 DIGESTION_OUTCOME_LABEL)
// 만 새 값 누락 시 컴파일 에러가 난다.
export type DraftStatus = PendingSourceItem["digestionOutcome"];

// 리뷰가 열린(review 있음) Source는 이미 초안을 벗어나 변경셋 대기로 넘어간 상태라
// null을 반환한다 — surface-inventory.md "초안" 참고. 판정을 여기 한 곳에 모아둬서,
// 호출부가 "먼저 필터링부터"라는 순서를 따로 기억하지 않아도 된다.
export function draftStatus(source: PendingSourceItem): DraftStatus | null {
  return source.review !== null ? null : source.digestionOutcome;
}

export function isDraftItem(source: PendingSourceItem): boolean {
  return draftStatus(source) !== null;
}
