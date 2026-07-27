import type { ReferenceMergeUpdate } from "@nema-io/shared";

import type { ReviewCitedReference } from "./types";

// mergeNote가 null이 아님을 타입으로 좁힌다 — 술어가 아닌 평범한 필터로는 이 보장이
// 런타임에만 성립하고 반환 타입엔 안 남아, 이후 소비처마다 mergeNote를 다시 string |
// null로 다뤄야 한다.
type MergeCandidate = ReviewCitedReference & { mergeNote: string };

// 병합 편집 대상 후보를 고른다 — 엔진 병합 제안이 있고(mergeNote != null, 단순 인용은
// 편집할 게 없다), 살아있는 Digest가 아직 그 Reference를 인용하는 것만(인용하던 후보를
// 다 지우면 병합도 의미를 잃는다). 제안 거부는 별도로 빼지 않는다 — "원래대로"가
// mergeNote를 원본 body로 되돌리면 RPC의 before===after no-op으로 병합이 안 걸린다.
// UI 렌더와 저장 페이로드(referenceUpdates)가 같은 함수를 쓴다 — 입력(살아남은 Digest의
// 인용 집합)은 호출부마다 따로 만들므로, 그 파생이 갈라지면 두 목록도 갈라진다.
export function selectMergeCandidates(args: {
  citedReferences: ReviewCitedReference[];
  citedReferenceIds: Set<string>;
}): MergeCandidate[] {
  const { citedReferences, citedReferenceIds } = args;
  return citedReferences.filter(
    (reference): reference is MergeCandidate =>
      reference.mergeNote !== null && citedReferenceIds.has(reference.id),
  );
}

// 편집 여부와 무관하게 살아있는 병합 후보 전량을 저장 페이로드로 — update_pending_ingestion이
// changes를 통째로 교체하므로, 여기서 빠진 제안은 확정 시 유실된다(trim은 확정 흐름이
// 최종적으로 한 번 더 한다).
export function toReferenceUpdates(
  references: MergeCandidate[],
): ReferenceMergeUpdate[] {
  return references.map((reference) => ({
    referenceId: reference.id,
    mergeNote: reference.mergeNote,
  }));
}
