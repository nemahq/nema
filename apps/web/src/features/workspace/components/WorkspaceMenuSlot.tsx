import { Skeleton } from "@nema-io/weave";

import { useSidebar } from "@web/components/layout/Sidebar";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

import { WorkspaceMenu } from "./WorkspaceMenu";

// Sidebar의 logo 자리에 꽂는다 — 이 자리는 펼침 때만 마운트되므로(Sidebar.tsx
// `{!collapsed && logo}`) collapsed를 따로 확인할 필요가 없다.
export function WorkspaceMenuSlotExpanded() {
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if (isLoading) {
    // 실제 pill(아바타 size-6 + 이름) 구조를 그대로 따라 아이콘·텍스트 자리만
    // 얇게 표시 — pill 전체를 단색으로 채우면 투박해 보인다.
    return (
      <div className="-mx-1 flex h-8 flex-1 items-center gap-1.5 rounded-md px-1.5">
        <Skeleton className="size-6 shrink-0 rounded-md" />
        <Skeleton className="h-3.5 w-24 rounded-sm" />
      </div>
    );
  }
  // 에러는 셸(WorkspaceSidebarLayout)이 처리하므로 여기 도달 시 데이터가 있다.
  if (!bootstrap) {
    return null;
  }
  return <WorkspaceMenu workspaceName={bootstrap.workspace.name} />;
}

// Sidebar의 topSlot 자리에 꽂는다 — 이 자리는 접힘 여부와 무관하게 항상
// 마운트되므로(Sidebar.tsx `{topSlot}`), 펼침일 땐 스스로 null을 반환해
// WorkspaceMenuSlotExpanded와 중복 렌더되지 않게 막는다.
export function WorkspaceMenuSlotCollapsed() {
  const { collapsed } = useSidebar();
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if (!collapsed) {
    return null;
  }
  if (isLoading) {
    return (
      <div className="flex w-full items-center justify-center py-1">
        <Skeleton className="size-8 rounded-md" />
      </div>
    );
  }
  if (!bootstrap) {
    return null;
  }
  return <WorkspaceMenu workspaceName={bootstrap.workspace.name} />;
}
