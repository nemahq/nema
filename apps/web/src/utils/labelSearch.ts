interface LabelCandidate {
  id: string;
  status: string;
}

export function filterActiveLabelCandidates<T extends LabelCandidate>(
  items: T[],
  getLabel: (item: T) => string,
  query: string,
  excludedIds: Set<string>,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter(
    (item) =>
      item.status === "active" &&
      !excludedIds.has(item.id) &&
      getLabel(item).toLowerCase().includes(normalizedQuery),
  );
}

export function hasExactLabelMatch<T>(
  candidates: T[],
  getLabel: (item: T) => string,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return candidates.some(
    (item) => getLabel(item).toLowerCase() === normalizedQuery,
  );
}

interface LabelSearchState<T> {
  candidates: T[];
  trimmedQuery: string;
  hasExactMatch: boolean;
  canCreate: boolean;
}

// 후보 목록과 "새로 만들기" 가능 여부는 항상 같은 세 조건에서 나온다 — 소비처마다
// 따로 조립하면 한쪽만 고쳐져 검색 결과와 생성 버튼이 어긋난다.
export function buildLabelSearchState<T extends LabelCandidate>(args: {
  items: T[];
  getLabel: (item: T) => string;
  query: string;
  existingLabels: string[];
}): LabelSearchState<T> {
  const { items, getLabel, query, existingLabels } = args;
  const candidates = filterActiveLabelCandidates(
    items,
    getLabel,
    query,
    new Set(),
  );
  const trimmedQuery = query.trim();
  const hasExactMatch = hasExactLabelMatch(candidates, getLabel, query);
  return {
    candidates,
    trimmedQuery,
    hasExactMatch,
    canCreate:
      trimmedQuery !== "" &&
      !hasExactMatch &&
      !isDuplicateLabelName(trimmedQuery, existingLabels),
  };
}

// 같은 Digest 안에서 이미 붙은 라벨과 같은 이름(대소문자 무시)으로는 새로 만들 수 없다 —
// 리뷰 확정 시 조용히 같은 뜻의 라벨이 중복 생성되는 걸 만들기 시점에 막는다.
export function isDuplicateLabelName(
  name: string,
  existingLabels: string[],
): boolean {
  const normalizedName = name.trim().toLowerCase();
  return existingLabels.some(
    (label) => label.trim().toLowerCase() === normalizedName,
  );
}
