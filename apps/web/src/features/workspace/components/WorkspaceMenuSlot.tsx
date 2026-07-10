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
    if (mode === "expanded") {
      // 실제 pill(아바타 size-6 + 이름) 구조를 그대로 따라 아이콘·텍스트 자리만
      // 얇게 표시 — pill 전체를 단색으로 채우면 투박해 보인다.
      return (
        <div className="-mx-1.5 flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5">
          <Skeleton className="size-6 shrink-0 rounded-md" />
          <Skeleton className="h-3.5 w-24 rounded-sm" />
        </div>
      );
    }
    return (
      <div className="flex w-full items-center justify-center py-1">
        <Skeleton className="size-8 rounded-md" />
      </div>
    );
  }
  // 에러는 셸(WorkspaceSidebarLayout)이 처리하므로 여기 도달 시 데이터가 있다.
  if (!bootstrap) {
    return null;
  }
  return <WorkspaceMenu workspaceName={bootstrap.workspace.name} />;
}
