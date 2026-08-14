import { memo } from "react";
import { Link, linkOptions } from "@tanstack/react-router";

import type { DigestListItem } from "@nema-io/shared";
import { cn, LIST_ITEM_HOVER_CLASSNAME, Text } from "@nema-io/weave";

import { DigestTypeBadge } from "./DigestTypeBadge";

interface DigestListRowProps {
  digest: DigestListItem;
  selected: boolean;
  // cmd/ctrl/shift/alt+click(새 탭)에서도 이 onClick은 이 탭에서 그대로 불린다 —
  // 하지만 실제로 열리는 건 새 탭(별개 프로세스의 새 상태)이라 여기서 기록한
  // knownDigestId는 그 탭엔 안 전해진다. 그 탭은 DigestDetailPanel이 digest.get
  // 응답을 기다려 채운다(DigestDetailPanel 참고). middle click은 auxclick이라
  // 이 onClick 자체가 안 불린다.
  onOpen?: (digest: DigestListItem) => void;
}

// cmd/middle click으로 새 탭에서 열 수 있어야 해서 button+onClick이 아니라
// 진짜 <a href>를 내는 Link로 렌더한다(legacy ChangesetListRow와 같은 이유).
// weave Button 대신 raw 스타일 — 이 행은 자체 타이포(유형 배지 + size="sm"
// 제목)와 자체 선택 표현을 가진 목록 항목이라, Button base의
// text-[13px] font-semibold를 되돌리는 비용이 얻는 것보다 크다
// (weave-usage.md "Button을 안 쓰는 자리").
export const DigestListRow = memo(function DigestListRow({
  digest,
  selected,
  onOpen,
}: DigestListRowProps) {
  return (
    <Link
      {...linkOptions({ to: "/", search: { digest: digest.publicId } })}
      onClick={() => onOpen?.(digest)}
      aria-current={selected ? "true" : undefined}
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
    </Link>
  );
});
