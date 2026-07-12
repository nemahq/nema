import { type ReactNode } from "react";

import { cn } from "@nema-io/weave";

import { LnbRowBox } from "./LnbRowBox";
import { useSidebar } from "./Sidebar";

interface LnbSectionProps {
  label: string;
  children: ReactNode;
  // 행 위에 겹치는 우측 액션(예: "+" 버튼) — NavItem의 trailingAction과 같은
  // 패턴. 렌더링까지 호출부가 맡아서 LnbSection은 항상 "Plus 아이콘"이라고
  // 전제하지 않는다.
  trailingAction?: ReactNode;
}

export function LnbSection({
  label,
  children,
  trailingAction,
}: LnbSectionProps) {
  const { collapsed } = useSidebar();
  // 호버 배경은 액션이 있는 섹션(Spaces)에서만 — Workspace 섹션은 클릭할 게
  // 없어서 호버가 의미 없다.
  const hoverable = !!trailingAction;

  return (
    <div className={cn("flex flex-col", !collapsed && "mt-2")}>
      {collapsed ? (
        // 라벨이 안 보이는 접힘 상태에서도 섹션 경계는 구분돼야 하니, 라벨
        // 대신 짧은 구분선으로 대체한다(mt-2 같은 여백만 남기면 아이콘 간격이
        // 다른 아이템끼리는 안 벌어져서 여기만 유독 떠 보인다). Workspace
        // 섹션은 지금 항목이 References 하나뿐이라 구분선을 그어도 경계로서
        // 의미가 없어 hoverable(=trailingAction 있는 섹션, 지금은 Spaces)에서만
        // 보인다.
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
          {trailingAction}
        </div>
      )}
      {children}
    </div>
  );
}
