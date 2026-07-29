import { trpc } from "@web/lib/trpc";

// TODO(temp): 스크롤 동작 육안 확인용 mock 30개 — 확인 끝나면 제거
const MOCK_TOPICS = Array.from({ length: 30 }, (_, i) => ({
  id: `mock-topic-${i}`,
  title: `임시 토픽 ${i + 1}`,
  status: "active" as const,
}));

// enabled 대신 소비처가 팝오버 열림에서만 이 훅을 마운트해 게이팅한다.
export function useTopicListSuspenseQuery(spaceId: string) {
  const result = trpc.topic.list.useSuspenseQuery({ spaceId });
  const [data, ...rest] = result;
  return [
    { ...data, topics: [...data.topics, ...MOCK_TOPICS] },
    ...rest,
  ] as typeof result;
}
