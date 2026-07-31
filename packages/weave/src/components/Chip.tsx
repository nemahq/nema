import * as React from "react";

import { XIcon } from "../icons";
import { cn } from "../utils";
import {
  BADGE_COLOR_CLASSNAME,
  type BadgeColor,
  NEUTRAL_TONE_CLASSNAME,
  OUTLINE_TONE_CLASSNAME,
} from "./Badge";

type ChipVariant = "neutral" | "outline";
type ChipShape = "rounded" | "pill";

// 사용자가 만드는 개방형 태그(Reference·Digest 공용) 전용 팔레트(tokens/index.css
// "Tag" 섹션 참고) — 생성 시 랜덤/엔진이 초기값을 채우지만 최종 결정권은 항상
// 사용자에게 있어 생성 폼·편집 팝오버 어디서든 8개 중 자유롭게 바꿀 수 있다.
// TagColor를 이 배열에서 유도해 그리드·리스트 색상 피커의 순회 순서와 타입이
// 서로 다른 목록으로 어긋날 수 없게 한다(packages/shared의 TagColorSchema는
// DB enum과 맞춰야 하는 별도 계층이라 이 배열과 독립적으로 유지된다).
const TAG_COLORS = [
  "sienna",
  "cyan",
  "sage",
  "olive",
  "terracotta",
  "rose",
  "mauve",
  "violet",
] as const;
type TagColor = (typeof TAG_COLORS)[number];

function getRandomTagColor(): TagColor {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

const STATIC_TONE_CLASSNAME: Record<ChipVariant, string> = {
  neutral: NEUTRAL_TONE_CLASSNAME,
  outline: OUTLINE_TONE_CLASSNAME,
};

// hover는 실제로 클릭되는 엘리먼트에만 얹는다 — remove 분기의 바깥 span처럼
// 그 자체는 안 눌리는 컨테이너에 씌우면 클릭 가능한 것처럼 보이는 거짓 신호가 된다.
// data-[state=open]도 같은 이유로 여기 묶는다 — DropdownMenuTrigger asChild로
// Chip을 쓰는 자리(DraftSpaceSelect 등)는 열려 있는 동안 눌린 것처럼 보여야
// 한다(#480, weave-usage.md).
const HOVER_CLASSNAME: Record<ChipVariant, string> = {
  neutral: "hover:bg-fg-primary/15 data-[state=open]:bg-fg-primary/15",
  outline: "hover:bg-fg-primary/5 data-[state=open]:bg-fg-primary/5",
};

// Tag 파스텔·Hue tint 배경 둘 다 옅은 알파 채움이라, bg-*/15 알파 겹침(다른
// variant와 같은 방식)이면 hover가 안 보인다 — brightness를 낮춰(밝게 만드는
// 대신 살짝 진하게) 신호를 만든다.
const TINT_HOVER_CLASSNAME = "hover:brightness-95";

// rounded는 태그·Topic처럼 여러 개를 나란히 늘어놓는 자리 — pill은 값 하나를
// 통째로 담는 자리(DraftSpaceSelect 등). Badge의 shape 구분과 같은 결.
const SHAPE_CLASSNAME: Record<ChipShape, string> = {
  rounded: "rounded-[4px]",
  pill: "rounded-full",
};

// 텍스트는 새 토큰 없이 fg-primary를 그대로 쓴다 — 배경이 라이트에서 매우
// 밝고 다크에서 카드보다 밝은 색이라, 각 테마의 기본 텍스트 색이 그대로
// 여유 있게 AA를 만족한다(tokens/index.css "Tag" 섹션 계산 근거).
const TAG_COLOR_CLASSNAME: Record<TagColor, string> = {
  sienna: "bg-tag-sienna text-fg-primary",
  cyan: "bg-tag-cyan text-fg-primary",
  sage: "bg-tag-sage text-fg-primary",
  olive: "bg-tag-olive text-fg-primary",
  terracotta: "bg-tag-terracotta text-fg-primary",
  rose: "bg-tag-rose text-fg-primary",
  mauve: "bg-tag-mauve text-fg-primary",
  violet: "bg-tag-violet text-fg-primary",
};

// TagColor·BadgeColor는 값 집합이 겹치지 않아 하나의 lookup으로 합쳐도 안전하다.
const COLOR_TONE_CLASSNAME: Record<TagColor | BadgeColor, string> = {
  ...TAG_COLOR_CLASSNAME,
  ...BADGE_COLOR_CLASSNAME,
};

// variant(neutral/outline)와 color는 배타적으로 받는다 — Badge의 variant/color
// 구분(의미 있는 톤 vs weave가 뜻을 모르는 분류)과 같은 이유. color는 TagColor
// (사용자 태그, 파스텔)와 BadgeColor(고정 5종 분류 배지, Hue) 둘 다 받는다 —
// DigestTypePicker처럼 Badge의 색 축을 그대로 쓰되 인터랙티브해야 하는 자리가 있다.
type ChipToneProps =
  | { variant?: ChipVariant; color?: never }
  | { variant?: never; color: TagColor | BadgeColor };

// onRemove·removeAriaLabel을 객체 하나로 묶지 않고 평평한 두 prop으로 둔다 —
// conventions.md "컴포넌트 데이터 prop은 원시값이어야 한다(콜백·children
// 예외)"라 객체 리터럴은 매 렌더 새 identity를 만든다. 둘을 여전히 같이
// 받게 강제하려고(제거 버튼엔 접근성 라벨이 필수) 유니언으로 묶는다.
type ChipRemoveProps =
  | { onRemove?: undefined; removeAriaLabel?: undefined }
  | { onRemove: () => void; removeAriaLabel: string };

// Badge(정적 라벨)와 짝을 이루는 인터랙티브 버전. remove가 없으면 항상 <button> —
// DropdownMenuTrigger asChild처럼 onClick이 아니라 onPointerDown 등 임의의
// prop으로 열림을 제어하는 소비처가 있어서, "정적이냐"를 어떤 prop 유무로
// 추론하면 안 되고 그냥 항상 버튼이어야 한다(정적 미리보기가 필요한 자리는
// Chip이 아니라 Badge를 쓴다). remove가 있으면 안에 실제 제거용 <button>이
// 하나 더 들어가야 하는데, <button> 안에 <button>을 중첩할 수 없어 그때만
// 루트를 <span>으로 바꾼다. Button은 base가 text-[13px] font-semibold를
// 강제해 되돌리는 비용이 커서 안 쓴다(weave-usage.md "Button" 표 "칩·pill 안
// 버튼" 제외 규칙 — 안의 라벨·제거 버튼도 같은 이유로 raw button).
function Chip({
  variant,
  color,
  shape = "pill",
  className,
  type = "button",
  truncated = false,
  onRemove,
  removeAriaLabel,
  onClick,
  disabled,
  children,
  ...props
}: Omit<React.ComponentPropsWithRef<"button">, "color"> &
  ChipToneProps &
  ChipRemoveProps & {
    shape?: ChipShape;
    // min-w-0 없이 truncate만 있으면 flex 안에서 조용히 안 먹으므로 항상 같이 묶는다.
    truncated?: boolean;
  }) {
  const toneClassName = cn(
    SHAPE_CLASSNAME[shape],
    color
      ? COLOR_TONE_CLASSNAME[color]
      : STATIC_TONE_CLASSNAME[variant ?? "neutral"],
  );
  const hoverClassName = color
    ? TINT_HOVER_CLASSNAME
    : HOVER_CLASSNAME[variant ?? "neutral"];
  const labelClassName = cn(truncated && "min-w-0 truncate");

  if (onRemove) {
    return (
      <span
        data-slot="chip"
        className={cn(
          "inline-flex items-center gap-1 py-0.5 pl-2 pr-1 text-[12px] font-medium leading-[1.4]",
          toneClassName,
          truncated && "min-w-0",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        {onClick ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
              labelClassName,
              hoverClassName,
              "disabled:pointer-events-none",
            )}
          >
            {children}
          </button>
        ) : (
          <span className={labelClassName}>{children}</span>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={removeAriaLabel}
          onClick={onRemove}
          className="rounded-full p-0.5 text-current/70 hover:bg-fg-primary/15 disabled:pointer-events-none"
        >
          <XIcon className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      type={type}
      data-slot="chip"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        toneClassName,
        hoverClassName,
        labelClassName,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export {
  Chip,
  type ChipShape,
  type ChipVariant,
  getRandomTagColor,
  TAG_COLOR_CLASSNAME,
  TAG_COLORS,
  type TagColor,
};
