import type { PendingSourceItem } from "@web/features/intake/types";

// 서버 DigestionOutcome과 동일한 값 집합 — 타입 별칭이 아니라 소스에서 직접 뽑아써서
// (PendingSourceItem["digestionOutcome"]) 서버가 값을 추가해도 이 파일을 안 고쳐도
// 자동으로 넓어지고, 반대로 이 유니온에 의존하는 소비처의 switch는 새 값이 안 걸리면
// 컴파일이 깨진다 — "결과없음"과 "버려짐"을 두 필드 AND로 조합해야 했던 예전 구조에서
// 소비처가 조합을 빠뜨렸던 사고(#428)를 타입 레벨로 다시 못 나게 막는다.
export type DraftStatus = PendingSourceItem["digestionOutcome"];

// 리뷰가 열린(reviewChangesetId 있음) Source는 이미 초안을 벗어나 변경셋 대기로
// 넘어간 상태라 null을 반환한다 — surface-inventory.md "초안" 참고. 판정을 여기 한
// 곳에 모아둬서, 호출부가 "먼저 필터링부터"라는 순서를 따로 기억하지 않아도 된다.
export function draftStatus(source: PendingSourceItem): DraftStatus | null {
  return source.reviewChangesetId !== null ? null : source.digestionOutcome;
}

export function isDraftItem(source: PendingSourceItem): boolean {
  return draftStatus(source) !== null;
}
