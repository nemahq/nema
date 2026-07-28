import { trpc } from "@web/lib/trpc";

export function useSourceContentSuspenseQuery(sourceId: string) {
  return trpc.source.get.useSuspenseQuery({ sourceId });
}
