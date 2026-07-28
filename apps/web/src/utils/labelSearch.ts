interface LabelCandidate {
  id: string;
  status: string;
}

function isActiveLabel(item: LabelCandidate): boolean {
  return item.status === "active";
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
      isActiveLabel(item) &&
      !excludedIds.has(item.id) &&
      getLabel(item).toLowerCase().includes(normalizedQuery),
  );
}

// 신규 라벨 이름 수정 시 비교할 레지스트리 이름 목록 — 검색어로 좁히지 않는다
// (검색창을 비워도 방금 만든 동명 라벨은 여전히 막아야 한다). TopicSearchList·
// TagSearchList 둘 다 같은 조건으로 조립하던 걸 여기 하나로 모은다.
export function getActiveLabelTitles<T extends LabelCandidate>(
  items: T[],
  getLabel: (item: T) => string,
): string[] {
  return items.filter(isActiveLabel).map(getLabel);
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

interface DraftLabelItem {
  id: string | null;
  title: string;
}

// 검색 리스트에 자기 자신을 노출해야 하는 신규(draft, id === null) 항목만
// 골라낸다 — draft도 다른 후보와 같은 규칙(텍스트 매칭)으로 나타나고 사라진다.
// 원래 배열의 index를 그대로 들고 있어야 이름을 고칠 때 어느 항목인지 가리킬 수
// 있고, 중복 검사에서 자기 자신을 빼는 데도 같은 index를 쓸 수 있다.
export function filterDraftLabelCandidates<T extends DraftLabelItem>(
  items: T[],
  query: string,
): Array<{ draft: T; index: number }> {
  const normalizedQuery = query.trim().toLowerCase();
  return items
    .map((draft, index) => ({ draft, index }))
    .filter(
      ({ draft }) =>
        draft.id === null &&
        draft.title.toLowerCase().includes(normalizedQuery),
    );
}

// 신규 라벨 자신의 이름을 고칠 때 쓰는 중복 판정 함수를 만든다 — 레지스트리
// 활성 이름 전체(검색어로 좁히지 않는다 — 검색창을 비워도 방금 만든 동명
// 라벨은 여전히 막아야 한다) + 같은 Digest에 이미 붙은 다른 라벨 이름, 둘
// 다와 비교한다. excludeAt은 수정 중인 항목 자신의 index — 안 빼면 "이름
// 그대로 저장"도 중복으로 막힌다. 같은 타입(string[]) 인자 두 개를 위치로
// 받으면 순서를 바꿔도 타입 에러 없이 조용히 틀리므로 객체로 받는다.
export function buildDraftRenameDuplicateCheck(args: {
  registryLabels: string[];
  digestLabels: string[];
  excludeAt: number;
}): (title: string) => boolean {
  const { registryLabels, digestLabels, excludeAt } = args;
  const existingLabels = [
    ...registryLabels,
    ...digestLabels.filter((_, index) => index !== excludeAt),
  ];
  return (title: string) => isDuplicateLabelName(title, existingLabels);
}
