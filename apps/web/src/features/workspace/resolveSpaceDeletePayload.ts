// SpaceDeleteConfirmForm의 select value에 쓰는 sentinel — Space id(uuid)와
// 절대 겹치지 않는다.
export const DELETE_PENDING_DRAFTS_OPTION = "delete";

interface SpaceDeletePayload {
  targetSpaceId: string | undefined;
  deletePendingDrafts: boolean | undefined;
}

export function resolveSpaceDeletePayload(
  draftCount: number,
  draftDisposition: string | undefined,
): SpaceDeletePayload {
  if (draftCount === 0) {
    return { targetSpaceId: undefined, deletePendingDrafts: undefined };
  }

  if (draftDisposition === DELETE_PENDING_DRAFTS_OPTION) {
    return { targetSpaceId: undefined, deletePendingDrafts: true };
  }

  return { targetSpaceId: draftDisposition, deletePendingDrafts: undefined };
}
