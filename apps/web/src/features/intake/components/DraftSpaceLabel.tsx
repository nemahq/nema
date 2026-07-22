import { Badge, Skeleton } from "@nema-io/weave";

import { useDraftSpace } from "@web/features/intake/hooks/useDraftSpace";

interface DraftSpaceLabelProps {
  spaceId: string;
}

// 정리 중인 초안처럼 Space 재지정이 막혀 있는 자리에 쓰는 읽기 전용 pill —
// DraftSpaceSelect(Chip)와 같은 neutral 톤이라 재지정 가능해지는 순간(Idle)
// 겉모습이 그대로 유지된다.
export function DraftSpaceLabel({ spaceId }: DraftSpaceLabelProps) {
  const { spaceName, isLoading } = useDraftSpace(spaceId);

  if (isLoading) {
    return <Skeleton className="-ml-2.5 h-6 w-24 rounded-full" />;
  }

  if (!spaceName) {
    return <span />;
  }

  return (
    <Badge
      variant="neutral"
      shape="pill"
      title={spaceName}
      truncated
      className="-ml-2.5"
    >
      {spaceName}
    </Badge>
  );
}
