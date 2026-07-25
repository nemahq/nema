import type { ChangesetType } from "@web/features/review";

export interface ChangesetInsertRow {
  id: string;
  space_id: string | null;
  number: number | null;
  type: ChangesetType;
}

// relation 등 ingestion 외 type도 백그라운드에서(예: apply_relation_changesets)
// pending 상태로 INSERT된다 — 딱 이 알림이 타겟하는 "탭 밖" 시나리오다. 하지만
// 리뷰 화면(digest-review-service)은 ingestion만 받고 나머진 에러로 거절하므로,
// 알림도 같은 조건으로 걸러야 클릭이 에러 화면으로 떨어지지 않는다.
export function isIngestionChangeset(
  row: ChangesetInsertRow,
): row is ChangesetInsertRow & { space_id: string; number: number } {
  return (
    row.type === "ingestion" && row.space_id !== null && row.number !== null
  );
}

export function resolveSpacePublicId(
  spaces: { id: string; publicId: string }[] | undefined,
  spaceId: string,
): string | undefined {
  return spaces?.find((space) => space.id === spaceId)?.publicId;
}
