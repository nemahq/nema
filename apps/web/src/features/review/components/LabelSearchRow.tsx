import type { ReactNode } from "react";

import { Badge, cn, LIST_ITEM_HOVER_CLASSNAME } from "@nema-io/weave";

interface LabelSearchRowProps {
  label: string;
  // 이 Digest에 이미 붙은 라벨도 목록에서 그대로 보여준다 — 이름·설명 수정
  // 진입점을 "붙은 것"과 "안 붙은 것" 둘로 안 쪼개고 이 목록 하나로 통일하기
  // 위해서다. 대신 이미 붙은 행은 클릭해도 다시 안 붙는다.
  attached: boolean;
  editing: boolean;
  onSelect: () => void;
  children: ReactNode;
}

// 후보 이름을 위쪽 칩 목록과 같은 Badge로 감싼다 — 고르면 그대로 저 모양의 칩이
// 된다는 걸 고르기 전에 미리 보여준다. 행 자체는 raw button — 전체 폭 hover 행이라
// weave Button의 고정 패딩·타이포가 안 맞는다.
export function LabelSearchRow({
  label,
  attached,
  editing,
  onSelect,
  children,
}: LabelSearchRowProps) {
  return (
    <li>
      <div
        className={cn(
          "group flex w-full items-center",
          LIST_ITEM_HOVER_CLASSNAME,
          "rounded-sm",
          // 편집 팝오버가 열려 있는 동안은 마우스가 팝오버 쪽으로 옮겨가 행에서
          // 벗어나도(:hover가 풀려도) 계속 활성 톤으로 보이게 강제한다 — 안 그러면
          // 편집 중인데 행이 비활성처럼 보인다.
          editing && "bg-surface-raised-hover/40",
        )}
      >
        {/* 이미 붙은 행도 hover는 계속 가능해야 해서(설명을 다시 볼 수 있어야 함)
            네이티브 disabled 대신 aria-disabled + 조건부 onClick으로 클릭만 막는다. */}
        <button
          type="button"
          aria-disabled={attached}
          onClick={attached ? undefined : onSelect}
          className="flex min-w-0 flex-1 cursor-pointer items-center py-1 text-left aria-disabled:cursor-default"
        >
          <Badge
            variant={attached ? "neutral" : "outline"}
            shape="rounded"
            truncated
          >
            {label}
          </Badge>
        </button>
        {children}
      </div>
    </li>
  );
}
