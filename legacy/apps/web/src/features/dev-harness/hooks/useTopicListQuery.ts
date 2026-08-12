import { trpc } from "@web/lib/trpc";

export function useTopicListSuspenseQuery(
  options?: Omit<
    Parameters<typeof trpc.topic.list.useSuspenseQuery>[1],
    "queryKey"
  >,
) {
  return trpc.topic.list.useSuspenseQuery(undefined, options);
}
