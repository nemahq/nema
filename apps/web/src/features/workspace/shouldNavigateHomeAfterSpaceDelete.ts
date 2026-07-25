export function shouldNavigateHomeAfterSpaceDelete(
  deletedSpacePublicId: string,
  activeSpacePublicId: string | undefined,
): boolean {
  return activeSpacePublicId === deletedSpacePublicId;
}
