import { trpc } from "@web/lib/trpc";

// TODO(temp): 스크롤 동작 육안 확인용 mock 30개 — 확인 끝나면 제거
const MOCK_TAG_COLORS = [
  "slate",
  "cyan",
  "sage",
  "olive",
  "terracotta",
  "rose",
  "mauve",
  "violet",
] as const;
const MOCK_TAGS = Array.from({ length: 30 }, (_, i) => ({
  id: `mock-tag-${i}`,
  title: `임시 태그 ${i + 1}`,
  description: "스크롤 확인용 임시 데이터",
  color: MOCK_TAG_COLORS[i % MOCK_TAG_COLORS.length],
  status: "active" as const,
  createdAt: new Date().toISOString(),
}));

// archived Tag는 재사용 제안 대상이 아니라 scope는 기본값(active)만 쓴다. enabled 대신
// 소비처가 팝오버 열림에서만 이 훅을 마운트해 게이팅한다.
export function useTagListSuspenseQuery() {
  const result = trpc.tag.list.useSuspenseQuery(undefined);
  const [data, ...rest] = result;
  return [
    { ...data, tags: [...data.tags, ...MOCK_TAGS] },
    ...rest,
  ] as typeof result;
}
