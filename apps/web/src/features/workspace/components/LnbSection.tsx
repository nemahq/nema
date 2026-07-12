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
    <div className={cn("flex flex-col", !collapsed && "mt-2")}>
      {collapsed ? (
        // 라벨이 안 보이는 접힘 상태에서도 섹션 경계는 구분돼야 하니, 라벨
        // 대신 짧은 구분선으로 대체한다(mt-2 같은 여백만 남기면 아이콘 간격이
        // 다른 아이템끼리는 안 벌어져서 여기만 유독 떠 보인다). Workspace
        // 섹션은 지금 항목이 References 하나뿐이라 구분선을 그어도 경계로서
        // 의미가 없어 hoverable(=onAdd 있는 섹션, 지금은 Spaces)에서만 보인다.
        hoverable && (
          <div className="flex justify-center py-1">
            <div aria-hidden className="h-px w-4 bg-border" />
          </div>
        )
      ) : (
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
