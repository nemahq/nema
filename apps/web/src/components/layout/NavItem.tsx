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
  // 행 우측 슬롯(카운트 뱃지·hover 전용 메뉴 등) — 펼침 모드에서만 렌더되고, 항상
  // 보일지 hover에만 보일지는 소비처가 자기 스타일(opacity 등)로 정한다.
  rightContent?: ReactNode;
  // 라벨 텍스트 바로 뒤에 붙는 슬롯(예: 상태 점) — rightContent와 달리 절대위치가
  // 아니라 라벨 옆에 자연스럽게 이어진다. 펼침 모드에서만 렌더된다.
  labelSuffix?: ReactNode;
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
  labelSuffix,
}: NavItemProps) {
  const { collapsed } = useSidebar();
  const disabled = !to;
  const activeProps =
    !disabled && showActive
      ? { className: "bg-surface-raised-hover/75" }
      : undefined;

  if (collapsed) {
    const content = disabled ? (
      <div
        aria-disabled
        className="flex size-7 cursor-default items-center justify-center rounded-lg text-fg-tertiary/60"
      >
        {icon}
      </div>
    ) : (
      <Link
        to={to}
        params={params}
        aria-label={label}
        className="relative flex size-7 items-center justify-center rounded-lg transition-colors duration-fast hover:bg-surface-raised-hover/75 focus-visible:z-10"
        activeProps={activeProps}
        activeOptions={activeOptions}
      >
        {icon}
      </Link>
    );

    return (
      <div className="flex justify-center py-1">
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {disabled ? (
              <>
                {label} · {disabledHint}
              </>
            ) : (
              label
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  let hoverClassName = "hover:bg-surface-raised-hover/75";
  if (disabled) {
    hoverClassName = "cursor-default text-fg-tertiary/60";
  } else if (rightContent) {
    hoverClassName = "group-hover:bg-surface-raised-hover/75";
  }

  // relative + focus-visible:z-10: SettingsNav와 같은 이유로, 포커스된 행을
  // 형제 위로 띄워 바로 아래 행의 배경이 이 행의 outline을 덮지 않게 한다.
  // pl-3: 하이라이트 박스 위치(LnbRowBox 공유 px-2.5)는 안 건드리고, 아이콘·
  // 텍스트만 라벨보다 아주 살짝(2px) 안쪽에서 시작하게 민다.
  // pr-8: rightContent는 절대위치로 겹쳐 그려지니(아래 참고), hover에서만 보이든
  // 항상 보이든 상관없이 라벨 텍스트가 그 자리 밑으로 안 들어가게 항상 비워둔다.
  const rowExtraClassName = cn(
    "relative pl-3 text-sm focus-visible:z-10",
    rightContent && "pr-8",
    hoverClassName,
  );

  const row = disabled ? (
    <LnbRowBox asChild className={rowExtraClassName}>
      <div aria-disabled>
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        {labelSuffix}
      </div>
    </LnbRowBox>
  ) : (
    <LnbRowBox asChild className={rowExtraClassName}>
      <Link
        to={to}
        params={params}
        title={label}
        activeProps={activeProps}
        activeOptions={activeOptions}
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        {labelSuffix}
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
