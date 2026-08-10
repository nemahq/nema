import { trpc } from "@web/lib/trpc";

export function useAccountDeletionBlockersSuspenseQuery() {
  return trpc.account.deletionBlockers.useSuspenseQuery(undefined);
}
