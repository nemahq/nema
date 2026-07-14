import { trpc } from "@web/lib/trpc";

// archived Tag는 재사용 제안 대상이 아니라 scope는 기본값(active)만 쓴다.
export function useTagListQuery(enabled: boolean) {
  return trpc.tag.list.useQuery(undefined, { enabled });
}
