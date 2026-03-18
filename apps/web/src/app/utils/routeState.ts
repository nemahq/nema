export function getRouteState(state: unknown, key: string): string | undefined {
  if (state && typeof state === "object" && key in state) {
    const raw = (state as Record<string, unknown>)[key];
    return typeof raw === "string" ? raw : undefined;
  }
  return undefined;
}
