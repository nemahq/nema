import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { isDraftItem } from "@web/features/intake/utils";

// Space 삭제 확인 UI가 "이 Space에 옮길 초안이 몇 개 있는지"만 알면 되므로,
// PendingSourceItem 모양 자체를 워크스페이스 쪽에 노출하지 않고 개수만 돌려준다.
export function useSpacePendingDraftCount(spaceId: string): number {
  const { data } = usePendingSourceListQuery();
  return (data?.items ?? []).filter(
    (source) => source.spaceId === spaceId && isDraftItem(source),
  ).length;
}
