import { trpc } from "@web/lib/trpc";

export function useTopicListQuery(spaceId: string, enabled: boolean) {
  return trpc.topic.list.useQuery({ spaceId }, { enabled });
}
