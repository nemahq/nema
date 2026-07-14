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
