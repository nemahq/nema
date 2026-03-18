export function getRouteState(state: unknown, key: string): string | undefined {
  if (state && typeof state === "object" && key in state) {
    const entry = (state as Record<string, unknown>)[key];
    return typeof entry === "string" ? entry : undefined;
  }
  return undefined;
}
