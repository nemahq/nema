import { Check } from "../icons";
import { cn } from "../utils";
import { TAG_COLOR_CLASSNAME, TAG_COLORS, type TagColor } from "./Chip";
import { ComboboxItem } from "./ComboboxItem";
import { Text } from "./Text";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

interface TagColorPickerProps {
  value: TagColor;
  onChange: (color: TagColor) => void;
  // weave는 tolgee를 모른다 — Chip의 color처럼 뜻을 모르는 값이라, 이름 문구는
  // 소비처가 번역해 넘긴다.
  getColorLabel: (color: TagColor) => string;
}

// 생성 폼용 — 스와치 8개를 한눈에 훑는 자리라 촘촘한 그리드. 파스텔 톤이라
// 스와치만으론 구분이 어려운 사용자를 위해 호버 시 이름을 Tooltip으로 보여준다.
function TagColorGridPicker({
  value,
  onChange,
  getColorLabel,
}: TagColorPickerProps) {
  return (
    <div className="grid grid-cols-4 justify-items-center gap-2">
      {TAG_COLORS.map((color) => (
        <Tooltip key={color}>
          <TooltipTrigger asChild>
            {/* Button 미사용 — 텍스트 없는 정사각 스와치라 base의 text-[13px]
                font-semibold을 되돌리는 비용만 생긴다(weave-usage.md "Button" 표). */}
            <button
              type="button"
              aria-label={getColorLabel(color)}
              aria-pressed={value === color}
              onClick={() => onChange(color)}
              className={cn(
                "size-8 rounded-md border-2 transition-colors",
                // Button의 primary variant와 같은 색 축(라이트 brand, 다크
                // fg-primary) — 선택 표시가 화면의 "확정 행동" 색과 같은
                // 의미로 읽히게 한다(Checkbox의 checked 테두리와 같은 패턴).
                value === color
                  ? "border-brand dark:border-fg-primary"
                  : "border-transparent",
                TAG_COLOR_CLASSNAME[color],
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={3}>
            {getColorLabel(color)}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// 편집 팝오버용 — 세로 리스트라 이름 텍스트를 바로 나란히 보여줄 수 있어 Tooltip이
// 필요 없다. 현재 값은 배경색 채움이 아니라 우측 체크 표시로만 강조한다 — 배경
// 강조는 ComboboxItem의 active가 이미 hover와 같은 축(fg-primary 틴트)이라 옅은
// 파스텔 배경 위에서 둘이 구분되지 않는다. readOnly는 켜지 않아 값을 계속 다시
// 골라 바꿀 수 있다.
function TagColorListPicker({
  value,
  onChange,
  getColorLabel,
}: TagColorPickerProps) {
  return (
    <ul className="flex flex-col">
      {TAG_COLORS.map((color) => (
        <li key={color}>
          <ComboboxItem
            onClick={() => onChange(color)}
            buttonClassName="gap-2 py-1.5"
            aria-pressed={value === color}
            actions={
              value === color && (
                <Check className="mr-2 size-4 shrink-0 text-fg-primary" />
              )
            }
          >
            <span
              className={cn(
                "size-3.5 shrink-0 rounded-md",
                TAG_COLOR_CLASSNAME[color],
              )}
            />
            <Text size="sm">{getColorLabel(color)}</Text>
          </ComboboxItem>
        </li>
      ))}
    </ul>
  );
}

export { TagColorGridPicker, TagColorListPicker };
