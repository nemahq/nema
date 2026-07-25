import { trpc } from "@web/lib/trpc";

// archived Tag는 재사용 제안 대상이 아니라 scope는 기본값(active)만 쓴다. enabled 대신
// 소비처가 팝오버 열림에서만 이 훅을 마운트해 게이팅한다.
export function useTagListSuspenseQuery() {
  return trpc.tag.list.useSuspenseQuery(undefined);
}
