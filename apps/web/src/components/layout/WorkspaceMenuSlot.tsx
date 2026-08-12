import { useSidebar } from "@web/components/layout/Sidebar";

import { WorkspaceMenu } from "./WorkspaceMenu";

// Sidebar의 logo 자리에 꽂는다 — 이 자리는 펼침 때만 마운트되므로(Sidebar.tsx
// `{!collapsed && logo}`) collapsed를 따로 확인할 필요가 없다.
export function WorkspaceMenuSlotExpanded() {
  return <WorkspaceMenu />;
}

// Sidebar의 topSlot 자리에 꽂는다 — 이 자리는 접힘 여부와 무관하게 항상
// 마운트되므로(Sidebar.tsx `{topSlot}`), 펼침일 땐 스스로 null을 반환해
// WorkspaceMenuSlotExpanded와 중복 렌더되지 않게 막는다.
export function WorkspaceMenuSlotCollapsed() {
  const { collapsed } = useSidebar();

  if (!collapsed) {
    return null;
  }

  return <WorkspaceMenu />;
}
