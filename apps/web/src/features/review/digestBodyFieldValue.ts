import type { DigestBodyFieldKind } from "@web/features/review/constants";

// 빈 string[] 필드는 []로는 타이핑을 시작할 줄 자체가 없어 [""] 하나를 깔아준다.
// 실제로 치기 전까진 초안에 넘기지 않아 서버로 나가는 값은 그대로 비어 있다.
const EMPTY_VALUE: Record<DigestBodyFieldKind, string | string[]> = {
  text: "",
  list: [""],
};

// 값이 진짜 없을 때(undefined·빈 배열)만 자리를 깔아준다 — 이미 자리가 있는
// 값(예: "   ", ["", ""])까지 모양을 바꾸면, 그 값을 커밋한 useDraftField가
// 다음 렌더에서 받는 committed가 자신이 방금 커밋한 값과 달라져 "바깥에서
// 바뀌었다"로 오판하고 그 사이 타이핑을 덮어쓴다.
export function resolveCommittedValue(
  stored: string | string[] | undefined,
  kind: DigestBodyFieldKind,
): string | string[] {
  if (stored === undefined) {
    return EMPTY_VALUE[kind];
  }
  if (Array.isArray(stored) && stored.length === 0) {
    return EMPTY_VALUE[kind];
  }
  return stored;
}
