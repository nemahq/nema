import { trpc } from "@web/lib/trpc";

// 확정·편집 시 기존 주제 재사용을 돕는 후보 목록(자유입력도 find-or-create로 허용).
export function useTopicListQuery() {
  return trpc.topic.list.useQuery();
}
