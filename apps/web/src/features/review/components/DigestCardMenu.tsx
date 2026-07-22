import { DIGEST_TYPES, type DigestType } from "@nema-io/shared";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Check, Ellipsis, Shapes, Trash2 } from "@nema-io/weave/icons";

import { DIGEST_TYPE_LABEL_KEY } from "@web/features/review/constants";
import { useTranslation } from "@web/lib/tolgee";

interface DigestCardMenuProps {
  currentType: DigestType;
  disabled: boolean;
  onChangeType: (type: DigestType) => void;
  onRemove: () => void;
}

// 타입 변경이 서브메뉴에 있는 이유는 빈도다 — "AI가 잘못 분류했을 때 바로잡는" 드문
// 동작이라 헤더에 상시 노출할 자리를 차지할 만큼 자주 쓰이지 않는다
// (design-decisions-log.md). 선택 표시는 Radix 기본(좌측 점) 대신 우측 체크마크 —
// 이 앱은 "지금 선택된 값"을 이미 우측 체크로 통일해 쓴다.
export function DigestCardMenu({
  currentType,
  disabled,
  onChangeType,
  onRemove,
}: DigestCardMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              shape="circle"
              disabled={disabled}
              aria-label={t("review.digest_menu_label")}
              className="text-fg-tertiary"
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("review.digest_menu_label")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" className="min-w-44">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Shapes />
            {t("review.digest_type_change_action")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {DIGEST_TYPES.map((type) => (
              <DropdownMenuItem
                key={type}
                className="pr-8"
                onClick={() => onChangeType(type)}
              >
                {t(DIGEST_TYPE_LABEL_KEY[type])}
                {type === currentType && (
                  <span className="absolute right-2 flex size-3.5 items-center justify-center">
                    <Check className="size-4" />
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem variant="danger" onClick={onRemove}>
          <Trash2 />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
