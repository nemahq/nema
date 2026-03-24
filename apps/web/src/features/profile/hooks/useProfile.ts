import { trpc } from "@web/lib/trpc";

const PROFILE_STALE_TIME_MS = 600_000;

export function useProfileQuery() {
  return trpc.profile.get.useQuery(undefined, {
    staleTime: PROFILE_STALE_TIME_MS,
  });
}

export function useProfileSuspenseQuery() {
  return trpc.profile.get.useSuspenseQuery(undefined, {
    staleTime: PROFILE_STALE_TIME_MS,
  });
}
