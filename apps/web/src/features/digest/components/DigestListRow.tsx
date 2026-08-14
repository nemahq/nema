import { memo } from "react";
import { Link, linkOptions } from "@tanstack/react-router";

import type { DigestListItem } from "@nema-io/shared";
import { cn, LIST_ITEM_HOVER_CLASSNAME, Text } from "@nema-io/weave";

import { DigestTypeBadge } from "./DigestTypeBadge";

interface DigestListRowProps {
  digest: DigestListItem;
  selected: boolean;
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
}: DigestListRowProps) {
  return (
    <Link
      {...linkOptions({ to: "/", search: { digest: digest.id } })}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left",
        LIST_ITEM_HOVER_CLASSNAME,
        // dark:bg-surface-raised-hover/40 — surface-raised는 다크 모드에서 이
        // 행이 얹힌 surface-card와 완전히 같은 값이라(tokens/index.css) 선택
        // 표시가 안 보인다. 다크에서는 호버 톤(LIST_ITEM_HOVER_CLASSNAME)과
        // 같은 값으로 맞춘다 — 선택 상태가 늘 호버된 것처럼 보이는 셈이라
        // 별도 색을 새로 안 만들어도 항상 대비가 생긴다.
        selected && "bg-surface-raised dark:bg-surface-raised-hover/40",
      )}
    >
      <DigestTypeBadge type={digest.type} />
      {/* weight="medium" — 배지는 테두리·아이콘이 있어 그 자체로 시각적
          무게가 크다. 제목이 기본(normal) 굵기면 부가 정보(유형)가 본문보다
          눈에 먼저 들어와 위계가 뒤집힌다 — 원문 헤더 이름(SourceDigestGroup)과
          같은 굵기로 맞춘다. */}
      <Text as="span" size="sm" weight="medium" className="min-w-0 truncate">
        {digest.title}
      </Text>
    </Link>
  );
});
