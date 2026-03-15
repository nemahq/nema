export function getRouteState(state: unknown, key: string): string | undefined {
  if (state && typeof state === "object" && key in state) {
    const value = (state as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}
