import { trpc } from "@web/lib/trpc";

export function useProfileQuery() {
  return trpc.profile.get.useSuspenseQuery();
}
