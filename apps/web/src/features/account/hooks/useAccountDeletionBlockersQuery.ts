import { trpc } from "@web/lib/trpc";

export function useAccountDeletionBlockersQuery(
  options?: Omit<
    Parameters<typeof trpc.account.deletionBlockers.useQuery>[1],
    "queryKey"
  >,
) {
  return trpc.account.deletionBlockers.useQuery(undefined, options);
}
