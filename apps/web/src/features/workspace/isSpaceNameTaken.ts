import type { Space } from "@nema-io/shared";

function normalizeForComparison(name: string): string {
  return name.trim().normalize("NFC").toLowerCase();
}

// 서버 유니크 인덱스(spaces_workspace_id_name_normalized_key)가
// lower(normalize(name, NFC)) 기준이므로, 여기도 같은 규칙(trim, NFC 정규화,
// 대소문자 무시)으로 비교해야 오탐/누락이 없다.
export function isSpaceNameTaken(
  spaces: Space[],
  name: string,
  excludeSpaceId?: string,
): boolean {
  const normalized = normalizeForComparison(name);
  return spaces.some(
    (space) =>
      space.id !== excludeSpaceId &&
      normalizeForComparison(space.name) === normalized,
  );
}
