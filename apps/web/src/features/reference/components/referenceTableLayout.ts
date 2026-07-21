// 헤더·행이 같은 그리드 트랙을 써야 컬럼이 어긋나지 않는다 — 한 곳에서만 정의.
// BE reference.list가 아직 type/title/status/createdAt만 내려줘서(설명·태그·인용·
// 최종수정은 단건 조회 전용, changeset 목록의 lean-list 패턴과 같은 결) 컬럼도
// 그만큼만 — 나머지는 상세 패널에서 보여준다.
export const REFERENCE_TABLE_GRID_CLASSNAME =
  "grid w-full grid-cols-[88px_minmax(160px,1fr)_88px_140px] gap-3";
