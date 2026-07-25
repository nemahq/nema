import { type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@nema-io/weave";

import { LnbRowBox } from "./LnbRowBox";
import { useSidebar } from "./Sidebar";

interface NavItemProps {
  icon: ReactNode;
  label: string;
  to?: LinkProps["to"];
  params?: LinkProps["params"];
  showActive?: boolean;
  activeOptions?: LinkProps["activeOptions"];
  // to가 없으면 비활성(placeholder) 모드 — 툴팁에 이 힌트가 덧붙는다.
  disabledHint?: ReactNode;
  // 행 우측 슬롯(카운트 뱃지·hover 전용 메뉴 등) — 펼침 모드에서만 렌더된다.
  rightContent?: ReactNode;
  // rightContent가 항상 보이는 배지인지(예: 초안 개수), 기본값(false)인
  // 호버 전용 메뉴인지 — 라벨 텍스트를 위해 미리 비워둘 자리(pr-8)가 항상
  // 고정인지 호버 시에만 생기는지를 가른다. 소비처의 opacity 스타일과
  // 반드시 짝을 맞출 것: 항상 보이면 true, 호버로만 드러나면 기본값 유지.
  rightContentAlwaysVisible?: boolean;
  // 라벨 텍스트 바로 뒤에 붙는 슬롯(예: 상태 점) — 펼침 모드에선 라벨 옆에 이어지고,
  // 접힘 모드에선 아이콘 우상단 배지로 얹힌다(정확한 수치보다 "상태 있음" 신호 위주).
  labelSuffix?: ReactNode;
  // title/aria-label/접힘 툴팁에 쓰는 문자열. 생략하면 label을 그대로 쓴다 — 라벨
  // 자체엔 못 넣는 부가 정보(예: 카운트)를 붙이고 싶을 때만 별도로 준다.
  tooltipLabel?: string;
}

export function NavItem({
  icon,
  label,
  to,
  params,
  showActive = true,
  activeOptions,
  disabledHint,
  rightContent,
  rightContentAlwaysVisible = false,
  labelSuffix,
  tooltipLabel = label,
}: NavItemProps) {
  const { collapsed } = useSidebar();
  const disabled = !to;
  // activeProps.className은 TanStack Router가 기본 className 뒤에 문자열로 그냥
  // 이어붙일 뿐 tailwind-merge를 거치지 않는다 — text-fg-secondary(평상시)와
  // text-fg-primary(active)가 동일 특이도라 어느 게 이기는지 클래스 문자열 순서가
  // 아니라 컴파일된 스타일시트 순서에 좌우돼 실제로 안 이기는 경우가 있었다.
  // data-[status=active]:* 는 속성 선택자라 특이도가 더 높아 순서와 무관하게
  // 항상 이겨서, hover:*와 같은 방식으로 base className 안에 직접 넣는다.
  const activeClassName =
    !disabled && showActive
      ? "data-[status=active]:bg-surface-raised-hover/75 data-[status=active]:text-fg-primary"
      : undefined;

  if (collapsed) {
    const content = disabled ? (
      <div
        aria-disabled
        className="flex size-7 cursor-default items-center justify-center rounded-lg text-fg-quinary"
      >
        {icon}
      </div>
    ) : (
      <Link
        to={to}
        params={params}
        aria-label={tooltipLabel}
        className={cn(
          "relative flex size-7 items-center justify-center rounded-lg text-fg-secondary transition-colors duration-fast hover:bg-surface-raised-hover/75 hover:text-fg-primary",
          activeClassName,
        )}
        activeOptions={activeOptions}
      >
        {icon}
        {labelSuffix && (
          <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center">
            {labelSuffix}
          </span>
        )}
      </Link>
    );

    return (
      <div className="flex justify-center py-1">
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {disabled ? (
              <>
                {tooltipLabel} · {disabledHint}
              </>
            ) : (
              tooltipLabel
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  let hoverClassName =
    "text-fg-secondary hover:bg-surface-raised-hover/75 hover:text-fg-primary";
  if (disabled) {
    hoverClassName = "cursor-default text-fg-quinary";
  } else if (rightContent) {
    hoverClassName =
      "text-fg-secondary group-hover:bg-surface-raised-hover/75 group-hover:text-fg-primary";
  }

  // pl-3: 하이라이트 박스 위치(LnbRowBox 공유 px-2.5)는 안 건드리고, 아이콘·
  // 텍스트만 라벨보다 아주 살짝(2px) 안쪽에서 시작하게 민다.
  // pr-8: rightContent는 절대위치로 겹쳐 그려지니(아래 참고) 라벨 텍스트가 그
  // 자리 밑으로 안 들어가게 비워둬야 한다 — 항상 보이는 배지는 고정 pr-8로,
  // 호버 전용 메뉴는 group-hover:pr-8로 평소엔 레이블이 끝까지 채우다 호버
  // 시에만 자리를 내주게 한다(design-decisions-log.md 참고, 공통화 과정에서
  // 한 번 고정 pr-8로 퇴행했던 걸 되돌림).
  // text-sm으로 따로 올리지 않고 LnbRowBox의 text-xs를 그대로 둔다 — 워크스페이스명
  // (text-sm)이 이 셸의 최상위 개체라는 크기 위계를 갖도록, 아이템은 Section 라벨과
  // 같은 크기를 공유한다. 평상시엔 색(fg-secondary vs fg-tertiary)으로만 구분하고,
  // hover·active 상태에서만 fg-primary로 올라와 상호작용 가능함을 신호한다.
  const rowExtraClassName = cn(
    "pl-3",
    rightContent && (rightContentAlwaysVisible ? "pr-8" : "group-hover:pr-8"),
    hoverClassName,
    activeClassName,
  );

  const row = disabled ? (
    <LnbRowBox asChild className={rowExtraClassName}>
      <div aria-disabled>
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        {labelSuffix && <span className="ml-1">{labelSuffix}</span>}
      </div>
    </LnbRowBox>
  ) : (
    <LnbRowBox asChild className={rowExtraClassName}>
      <Link
        to={to}
        params={params}
        title={tooltipLabel}
        activeOptions={activeOptions}
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        {labelSuffix && <span className="ml-1">{labelSuffix}</span>}
      </Link>
    </LnbRowBox>
  );

  return (
    <div
      className={cn(
        "px-2 py-px",
        rightContent && "group relative flex items-center",
      )}
    >
      {disabled ? (
        <Tooltip>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {disabledHint}
          </TooltipContent>
        </Tooltip>
      ) : (
        row
      )}
      {rightContent}
    </div>
  );
}
