import type { ChangesetStatus, ChangesetType } from "@web/features/review";

export interface ChangesetInsertRow {
  id: string;
  space_id: string | null;
  number: number | null;
  type: ChangesetType;
  status: ChangesetStatus;
}

// "리뷰가 필요한 상태로 새로 생겼다"는 type이 아니라 status로 판정한다 — ingestion은
// 항상 open으로 시작하고, relation도 확신 매칭이면 즉시 closed, 애매·충돌·중복이면
// open으로 시작한다(manual·revert는 항상 즉시 closed). type만 보던 이전 버전은
// 그래서 relation의 판정 대기 건을 전부 놓쳤다. 중복 판정 화면은 아직 없어 그
// changeset도 알림이 뜨면 클릭 시 "찾을 수 없음"으로 떨어지지만, 변경셋 탭에서
// 직접 눌러도 같은 결과라 알림만 따로 막지 않는다(changesets 테이블 자체엔 충돌·
// 중복을 가르는 컬럼이 없어 여기서 걸러내려면 별도 조회가 필요하다).
export function needsReviewNotification(
  row: ChangesetInsertRow,
): row is ChangesetInsertRow & { space_id: string; number: number } {
  return row.status === "open" && row.space_id !== null && row.number !== null;
}

export function resolveSpacePublicId(
  spaces: { id: string; publicId: string }[] | undefined,
  spaceId: string,
): string | undefined {
  return spaces?.find((space) => space.id === spaceId)?.publicId;
}
