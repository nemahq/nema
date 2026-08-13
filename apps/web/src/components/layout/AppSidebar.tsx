import type { ReactNode } from "react";

import { Sidebar } from "@web/components/layout/Sidebar";
import {
  WorkspaceMenuSlotCollapsed,
  WorkspaceMenuSlotExpanded,
} from "@web/components/layout/WorkspaceMenuSlot";

interface AppSidebarProps {
  children?: ReactNode;
}

// 항목(children)은 app 레이어(AppLayout)가 주입한다 — 이 컴포넌트는 component
// 계층이라 feature를 직접 import할 수 없다(eslint boundaries/element-types).
export function AppSidebar({ children }: AppSidebarProps) {
  return (
    <Sidebar
      hideToggle
      logo={<WorkspaceMenuSlotExpanded />}
      topSlot={<WorkspaceMenuSlotCollapsed />}
    >
      {children}
    </Sidebar>
  );
}
