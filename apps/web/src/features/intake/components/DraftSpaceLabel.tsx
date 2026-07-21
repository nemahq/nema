import { Skeleton, Text } from "@nema-io/weave";

import { SPACE_PILL_CLASSNAME } from "@web/features/intake/constants";
import { useDraftSpace } from "@web/features/intake/hooks/useDraftSpace";

interface DraftSpaceLabelProps {
  spaceId: string;
}

// 정리 중인 초안처럼 Space 재지정이 막혀 있는 자리에 쓰는 읽기 전용 pill.
export function DraftSpaceLabel({ spaceId }: DraftSpaceLabelProps) {
  const { spaceName, isLoading } = useDraftSpace(spaceId);

  if (isLoading) {
    return <Skeleton className="-ml-2.5 h-6 w-24 rounded-full" />;
  }

  if (!spaceName) {
    return <span />;
  }

  return (
    <span className={SPACE_PILL_CLASSNAME} title={spaceName}>
      <Text as="span" size="sm" weight="medium" color="primary">
        {spaceName}
      </Text>
    </span>
  );
}
