import type { ReactNode } from "react";

import { Badge, ComboboxItem, Text } from "@nema-io/weave";

import { NewLabelMark } from "./NewLabelMark";

interface LabelSearchRowProps {
  label: string;
  // 이 Digest에 이미 붙은 라벨도 목록에서 그대로 보여준다 — "붙은 것"과 "안
  // 붙은 것"을 둘로 쪼개지 않고 이 목록 하나로 통일하기 위해서다. 대신 이미
  // 붙은 행은 클릭해도 다시 안 붙는다.
  attached: boolean;
  // 이 리뷰에서 새로 만든 라벨(id===null)이면 true — Badge에 신규 표식을 얹는다.
  isNew?: boolean;
  editing?: boolean;
  description?: string;
  onSelect: () => void;
  // 신규 라벨 행에만 붙는 이름 수정 진입점(LabelInlineEditPopover) — 있으면
  // ComboboxItem의 actions로 넘어간다.
  children?: ReactNode;
}

// 후보 이름을 위쪽 칩 목록과 같은 Badge로 감싼다 — 고르면 그대로 저 모양의 칩이
// 된다는 걸 고르기 전에 미리 보여준다.
export function LabelSearchRow({
  label,
  attached,
  isNew = false,
  editing = false,
  description,
  onSelect,
  children,
}: LabelSearchRowProps) {
  return (
    <li>
      <ComboboxItem
        alreadySelected={attached}
        onClick={onSelect}
        actions={children}
        rowClassName={editing ? "bg-surface-raised-hover/40" : undefined}
        buttonClassName="py-1"
      >
        <Badge
          variant={attached ? "neutral" : "outline"}
          shape="rounded"
          truncated
        >
          {isNew ? (
            <span className="inline-flex items-center gap-1">
              <NewLabelMark />
              <span className="truncate">{label}</span>
            </span>
          ) : (
            label
          )}
        </Badge>
      </ComboboxItem>
      {description && (
        <Text
          as="p"
          size="sm"
          color="tertiary"
          className="line-clamp-2 px-2 pb-1"
        >
          {description}
        </Text>
      )}
    </li>
  );
}
