import { type ReactNode } from "react";

import { cn } from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { useSidebar } from "@web/components/layout/Sidebar";

interface LnbSectionProps {
  label: string;
  children: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}

export function LnbSection({
  label,
  children,
  onAdd,
  addLabel,
}: LnbSectionProps) {
  const { collapsed } = useSidebar();
  // 호버 배경은 추가 액션이 있는 섹션(Spaces)에서만 — Workspace 섹션은 클릭할
  // 게 없어서 호버가 의미 없다.
  const hoverable = !!onAdd;

  return (
    <div className="mt-2 flex flex-col gap-0.5">
      {!collapsed && (
        // px-1.5(바깥)+rounded-lg px-2.5(안쪽): LNB 아이템 행(SidebarNavLink)의
        // 하이라이트 박스 폭·radius와 동일하게 맞춘다. "+"는 절대 위치로 빼서
        // right-1.5로 다른 LNB 우측 아이콘(SpaceItemMenu, 접기 토글)과 인셋을 맞춘다.
        <div className="group/section relative flex items-center px-2">
          <div
            className={cn(
              "flex h-7 flex-1 items-center rounded-lg px-2.5",
              hoverable &&
                "transition-colors duration-fast group-hover/section:bg-surface-raised-hover/75",
            )}
          >
            <span className="text-xs font-medium text-fg-tertiary">
              {label}
            </span>
          </div>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={addLabel}
              className="absolute right-3.5 flex size-5 shrink-0 items-center justify-center rounded-md text-fg-tertiary opacity-0 transition-colors duration-fast hover:bg-surface-raised-hover hover:text-fg-primary hover:brightness-95 dark:hover:brightness-125 focus-visible:opacity-100 group-hover/section:opacity-100"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
