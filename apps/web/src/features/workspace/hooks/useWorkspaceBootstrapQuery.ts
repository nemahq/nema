import { trpc } from "@web/lib/trpc";

const BOOTSTRAP_STALE_TIME_MS = 600_000;

export function useWorkspaceBootstrapQuery(
  options?: Omit<
    Parameters<typeof trpc.workspace.bootstrap.useQuery>[1],
    "queryKey"
  >,
) {
  return trpc.workspace.bootstrap.useQuery(undefined, {
    staleTime: BOOTSTRAP_STALE_TIME_MS,
    meta: { reportToSentry: true },
    ...options,
  });
}

export function useWorkspaceBootstrapSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.workspace.bootstrap.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.workspace.bootstrap.useSuspenseQuery(undefined, {
    staleTime: BOOTSTRAP_STALE_TIME_MS,
    meta: { reportToSentry: true },
    ...options,
  });
}
