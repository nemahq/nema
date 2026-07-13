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
  // 행 위에 겹치는 우측 액션 아이콘(예: SpaceItemMenu) — 펼침 모드에서만 렌더된다.
  trailingAction?: ReactNode;
}

export function NavItem({
  icon,
  label,
  to,
  params,
  showActive = true,
  activeOptions,
  disabledHint,
  trailingAction,
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
  } else if (trailingAction) {
    hoverClassName = "group-hover:bg-surface-raised-hover/75";
  }

  // relative + focus-visible:z-10: SettingsNav와 같은 이유로, 포커스된 행을
  // 형제 위로 띄워 바로 아래 행의 배경이 이 행의 outline을 덮지 않게 한다.
  // pl-3: 하이라이트 박스 위치(LnbRowBox 공유 px-2.5)는 안 건드리고, 아이콘·
  // 텍스트만 라벨보다 아주 살짝(2px) 안쪽에서 시작하게 민다.
  const rowExtraClassName = cn(
    "relative pl-3 text-sm focus-visible:z-10",
    trailingAction && "group-hover:pr-8",
    hoverClassName,
  );

  const row = disabled ? (
    <LnbRowBox asChild className={rowExtraClassName}>
      <div aria-disabled>
        {icon}
        <span className="min-w-0 truncate">{label}</span>
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
      </Link>
    </LnbRowBox>
  );

  return (
    <div
      className={cn(
        "px-2 py-px",
        trailingAction && "group relative flex items-center",
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
      {trailingAction}
    </div>
  );
}
