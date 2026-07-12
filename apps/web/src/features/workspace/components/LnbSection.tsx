import { type ReactNode } from "react";

import { cn } from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { LnbHoverIcon } from "@web/components/layout/LnbHoverIcon";
import { LnbRowBox } from "@web/components/layout/LnbRowBox";
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
        <div className="group/section relative flex items-center px-2">
          <LnbRowBox
            className={cn(
              hoverable && "group-hover/section:bg-surface-raised-hover/75",
            )}
          >
            <span className="font-medium text-fg-tertiary">{label}</span>
          </LnbRowBox>
          {onAdd && (
            <LnbHoverIcon
              onClick={onAdd}
              aria-label={addLabel}
              className="absolute right-3.5 text-fg-tertiary hover:text-fg-primary group-hover/section:opacity-100"
            >
              <Plus className="size-4" />
            </LnbHoverIcon>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
