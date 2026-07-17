interface SpaceDeletePayload {
  targetSpaceId: string | undefined;
  deletePendingDrafts: boolean | undefined;
}

export function resolveSpaceDeletePayload(
  draftCount: number,
  targetSpaceId: string | undefined,
  deleteTogether: boolean,
): SpaceDeletePayload {
  if (draftCount === 0) {
    return { targetSpaceId: undefined, deletePendingDrafts: undefined };
  }

  if (deleteTogether) {
    return { targetSpaceId: undefined, deletePendingDrafts: true };
  }

  return { targetSpaceId, deletePendingDrafts: undefined };
}
