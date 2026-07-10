import { Skeleton } from "@nema-io/weave";

import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

import { WorkspaceMenu } from "./WorkspaceMenu";

// 에러(로딩도 아닌데 데이터 없음)일 땐 가짜 로딩 스켈레톤을 계속 보이지 않는다.
export function WorkspaceMenuSlot() {
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();

  if (isLoading) {
    return <Skeleton className="mx-1.5 h-9" />;
  }
  if (!bootstrap) {
    return null;
  }
  return <WorkspaceMenu workspaceName={bootstrap.workspace.name} />;
}
