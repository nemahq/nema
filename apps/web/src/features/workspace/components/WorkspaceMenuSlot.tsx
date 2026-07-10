import { Skeleton } from "@nema-io/weave";

import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

import { WorkspaceMenu } from "./WorkspaceMenu";

export function WorkspaceMenuSlot() {
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if (isLoading) {
    return <Skeleton className="mx-1.5 h-9" />;
  }
  // 에러는 셸(WorkspaceSidebarLayout)이 처리하므로 여기 도달 시 데이터가 있다.
  if (!bootstrap) {
    return null;
  }
  return <WorkspaceMenu workspaceName={bootstrap.workspace.name} />;
}
