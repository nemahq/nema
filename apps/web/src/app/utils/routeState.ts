export function getRouteState(state: unknown, key: string): string | undefined {
  if (state && typeof state === "object" && key in state) {
    return (state as Record<string, unknown>)[key] as string | undefined;
  }
  return undefined;
}
