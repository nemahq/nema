import { Skeleton } from "@nema-io/weave";

import { useSidebar } from "@web/components/layout/Sidebar";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

import { WorkspaceMenu } from "./WorkspaceMenu";

interface WorkspaceMenuSlotProps {
  mode: "collapsed" | "expanded";
}

// Sidebar의 logo(펼침 때만 마운트)·topSlot(항상 마운트) 두 자리에 각각 꽂힌다 —
// 지금 collapse 상태와 자기 mode가 안 맞으면 그려선 안 되니(중복 렌더 방지) 여기서 막는다.
export function WorkspaceMenuSlot({ mode }: WorkspaceMenuSlotProps) {
  const { collapsed } = useSidebar();
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if ((mode === "collapsed") !== collapsed) {
    return null;
  }
  if (isLoading) {
    return <Skeleton className="mx-1.5 h-9" />;
  }
  // 에러는 셸(WorkspaceSidebarLayout)이 처리하므로 여기 도달 시 데이터가 있다.
  if (!bootstrap) {
    return null;
  }
  return <WorkspaceMenu workspaceName={bootstrap.workspace.name} />;
}
