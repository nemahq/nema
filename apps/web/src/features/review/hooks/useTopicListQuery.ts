import { trpc } from "@web/lib/trpc";

// enabled 대신 소비처가 팝오버 열림에서만 이 훅을 마운트해 게이팅한다.
export function useTopicListSuspenseQuery(spaceId: string) {
  return trpc.topic.list.useSuspenseQuery({ spaceId });
}
