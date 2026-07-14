import type { ChangesetListEntry } from "./types";

const EFFECT_LABEL: Record<string, string> = {
  statement: "진술",
  relation: "관계",
  source: "source",
  digest: "digest",
  reference: "레퍼런스",
};

// Changeset.title이 아직 스키마에 없어(design-decisions-log 참고) 목록 행의 임시
// 대체 표기로 쓴다 — title 컬럼이 생기면 이 호출부를 그 값으로 바꾸면 된다.
export function summarizeChangesetEffect(
  effect: ChangesetListEntry["effect"],
): string {
  const parts = Object.entries(effect)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${EFFECT_LABEL[type] ?? type} ${count}`);
  return parts.length > 0 ? parts.join(" · ") : "변경 없음";
}
