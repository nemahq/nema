import { trpc } from "@web/lib/trpc";

export function useTopicListQuery(enabled: boolean) {
  return trpc.topic.list.useQuery(undefined, { enabled });
}
