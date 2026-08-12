import { trpc } from "@web/lib/trpc";

const PROFILE_STALE_TIME_MS = 600_000;

export function useProfileSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.profile.get.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.profile.get.useSuspenseQuery(undefined, {
    staleTime: PROFILE_STALE_TIME_MS,
    ...options,
  });
}
