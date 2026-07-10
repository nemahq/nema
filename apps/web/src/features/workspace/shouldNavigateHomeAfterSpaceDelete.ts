export function shouldNavigateHomeAfterSpaceDelete(
  deletedSpaceId: string,
  activeSpaceId: string | undefined,
): boolean {
  return activeSpaceId === deletedSpaceId;
}
