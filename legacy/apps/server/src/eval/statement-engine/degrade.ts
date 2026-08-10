// 골든 인위 열화 — 추출 약점을 모사해 하류 민감도를 잰다 (NEM-168 태스크 8).
// 뭉치기(boundary removal): 문서 내 인접 진술을 합쳐 과소분할을 모사한다 —
// #312(측정 #13)가 잰 "쪼개기 경계 불안정" 그 자체. rate를 올리며 하류(검색·관계)가
// 어디서 깨지는지로 합격선을 앵커링 없이 도출한다.

export interface MergeableStatement {
  id: string;
  content: string;
}

export interface MergedGroup<T extends MergeableStatement> {
  /** 합친 원본 id를 "+"로 이은 합성 id */
  id: string;
  content: string;
  /** 원본들 — 첫 멤버가 type·confidence 등의 대표 */
  members: T[];
  /** 이 합성 진술이 덮는 원본 id들 (커버리지 채점용) */
  sourceIds: string[];
}

interface MergeResult<T extends MergeableStatement> {
  groups: MergedGroup<T>[];
  /** 원본 id → 그 진술을 품은 합성 진술 id */
  remap: Map<string, string>;
}

function makeGroup<T extends MergeableStatement>(members: T[]): MergedGroup<T> {
  const sourceIds = members.map((member) => member.id);
  return {
    id: sourceIds.join("+"),
    content: members.map((member) => member.content).join(" "),
    members,
    sourceIds,
  };
}

// rate(0~1): 문서 내 내부 경계 중 제거할 비율. 0=불변, 1=문서 전체가 1진술.
// 제거할 경계는 균등 간격으로 결정적 선택 — 무작위 없이 재현 가능, 한쪽에 쏠리지 않게.
export function mergeByBoundaryRemoval<T extends MergeableStatement>(
  statements: T[],
  rate: number,
): MergeResult<T> {
  const boundaries = statements.length - 1;
  if (boundaries <= 0 || rate <= 0) {
    const groups = statements.map((statement) => makeGroup([statement]));
    const remap = new Map(groups.map((group) => [group.id, group.id]));
    return { groups, remap };
  }

  const removeCount = Math.min(
    boundaries,
    Math.max(0, Math.round(rate * boundaries)),
  );
  const removed = new Set<number>();
  for (let k = 0; k < removeCount; k += 1) {
    removed.add(Math.floor(((k + 0.5) * boundaries) / removeCount));
  }

  const groups: MergedGroup<T>[] = [];
  let current: T[] = [statements[0]];
  // 경계 j는 진술 j와 j+1 사이. 제거된 경계면 j+1을 현재 그룹에 합치고, 아니면 끊는다.
  for (let j = 0; j < boundaries; j += 1) {
    const next = statements[j + 1];
    if (removed.has(j)) {
      current.push(next);
    } else {
      groups.push(makeGroup(current));
      current = [next];
    }
  }
  groups.push(makeGroup(current));

  const remap = new Map<string, string>();
  for (const group of groups) {
    for (const sourceId of group.sourceIds) {
      remap.set(sourceId, group.id);
    }
  }
  return { groups, remap };
}
