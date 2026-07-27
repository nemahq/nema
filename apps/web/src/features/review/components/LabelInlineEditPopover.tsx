import type { ReactNode } from "react";

import {
  HoverIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@nema-io/weave";
import { Ellipsis } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface LabelInlineEditPopoverProps {
  open: boolean;
  // 저장/취소 버튼이 없어 이 콜백이 유일한 저장 시점이다 — 트리거 클릭뿐 아니라
  // 바깥 클릭·Escape로 닫힐 때도 같은 경로로 모인다.
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

// 수정은 행 안에서 펼치지 않고 Notion의 프로퍼티 값 수정 패널처럼 팝오버
// 옆(오른쪽)에 따로 뜬다 — 이 리스트가 좁아서 안에서 펼치면 다른 행들을
// 밀어내거나 잘린다.
export function LabelInlineEditPopover({
  open,
  onOpenChange,
  children,
}: LabelInlineEditPopoverProps) {
  const { t } = useTranslation();

  return (
    // modal — 이 팝오버는 항상 다른 팝오버(TagEditPanel·TopicEditPanel) 안에 중첩된다.
    // 두 layer 모두 기본값(non-modal)이면 바깥 클릭이 두 layer에 동시에 "바깥"으로
    // 잡혀 한 번에 같이 닫힌다. 이 안쪽 layer만 modal로 두면 그 열려 있는 동안 바깥
    // layer의 바깥-클릭 판정이 억제돼, 첫 클릭엔 이것만 닫히고 다음 클릭에야 바깥
    // 팝오버가 닫힌다.
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <HoverIcon
          active={open}
          aria-label={t("review.label_edit_action")}
          className="group-hover:opacity-100"
        >
          <Ellipsis className="size-3" />
        </HoverIcon>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-64 p-2"
      >
        <div className="flex flex-col gap-1.5">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
