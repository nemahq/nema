import type { Space } from "@nema-io/shared";

// 서버 유니크 제약(spaces_workspace_id_name_key)이 trim만 하고 대소문자는
// 구분하므로, 여기도 같은 규칙으로 비교해야 오탐/누락이 없다.
export function isSpaceNameTaken(
  spaces: Space[],
  name: string,
  excludeSpaceId?: string,
): boolean {
  return spaces.some(
    (space) => space.id !== excludeSpaceId && space.name === name,
  );
}
