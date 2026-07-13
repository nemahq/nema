export function getFirstEntryRedirectSpaceId(
  isFirstEntry: boolean | undefined,
  pathname: string,
  spaces: Array<{ id: string }> | undefined,
): string | null {
  if (!isFirstEntry || pathname !== "/") {
    return null;
  }
  const [firstSpace] = spaces ?? [];
  return firstSpace?.id ?? null;
}
