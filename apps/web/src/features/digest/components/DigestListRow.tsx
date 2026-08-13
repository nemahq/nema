import type { DigestListItem } from "@nema-io/shared";
import { cn, LIST_ITEM_HOVER_CLASSNAME, Text } from "@nema-io/weave";

import { DigestTypeBadge } from "./DigestTypeBadge";

interface DigestListRowProps {
  digest: DigestListItem;
  selected: boolean;
  onSelect: (digestId: string) => void;
}

// weave Button 대신 raw button — 이 행은 자체 타이포(유형 배지 + size="sm" 제목)와
// 자체 선택 표현을 가진 목록 항목이라, Button base의 text-[13px] font-semibold를
// 되돌리는 비용이 얻는 것보다 크다(weave-usage.md "Button을 안 쓰는 자리").
export function DigestListRow({
  digest,
  selected,
  onSelect,
}: DigestListRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(digest.id)}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left",
        LIST_ITEM_HOVER_CLASSNAME,
        selected && "bg-surface-raised",
      )}
    >
      <DigestTypeBadge type={digest.type} />
      <Text as="span" size="sm" className="min-w-0 truncate">
        {digest.title}
      </Text>
    </button>
  );
}
