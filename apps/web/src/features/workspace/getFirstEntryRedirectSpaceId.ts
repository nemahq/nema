export function getFirstEntryRedirectSpaceId(
  isFirstEntry: boolean | undefined,
  pathname: string,
  spaces: Array<{ publicId: string }> | undefined,
): string | null {
  if (!isFirstEntry || pathname !== "/") {
    return null;
  }
  const [firstSpace] = spaces ?? [];
  return firstSpace?.publicId ?? null;
}
