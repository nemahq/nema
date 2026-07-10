import { type ReactNode, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

interface WorkspaceBootstrapGateProps {
  children: ReactNode;
}

// 이 유저의 첫 진입일 때만 기본 Space 오버뷰로 보낸다(bootstrap의 isFirstEntry —
// 가입 트리거가 Space를 미리 만들어 "Space 존재"로는 신규를 못 가른다). 기존 유저는
// 손대지 않아 원래 도착지(홈 등)에 그대로 머문다(workspace-account-flow.md 참고).
export function WorkspaceBootstrapGate({
  children,
}: WorkspaceBootstrapGateProps) {
  const { data } = useWorkspaceBootstrapQuery();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const redirected = useRef(false);

  useEffect(
    function redirectFirstEntryToDefaultSpace() {
      if (redirected.current || !data?.isFirstEntry) {
        return;
      }
      if (pathname !== "/") {
        return;
      }
      const [firstSpace] = data.spaces;
      if (!firstSpace) {
        return;
      }
      redirected.current = true;
      void navigate({
        to: "/space/$spaceId",
        params: { spaceId: firstSpace.id },
        replace: true,
      });
    },
    [data, pathname, navigate],
  );

  return <>{children}</>;
}
