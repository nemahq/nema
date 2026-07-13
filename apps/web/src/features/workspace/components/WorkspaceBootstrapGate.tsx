import { type ReactNode, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { getFirstEntryRedirectSpaceId } from "@web/features/workspace/getFirstEntryRedirectSpaceId";
import { useSpaceList } from "@web/features/workspace/hooks/useSpaceList";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";

interface WorkspaceBootstrapGateProps {
  children: ReactNode;
}

// 이 유저의 첫 진입일 때만 기본 Space 오버뷰로 보낸다(bootstrap의 isFirstEntry —
// 가입 트리거가 Space를 미리 만들어 "Space 존재"로는 신규를 못 가른다). 기존 유저는
// 손대지 않아 원래 도착지(홈 등)에 그대로 머문다(workspace-account-flow.md 참고).
// isFirstEntry(bootstrap)와 첫 Space(space.list)는 서로 다른 쿼리라 도착 순서가
// 다를 수 있다 — 판단을 순수 함수로 뽑아 effect가 재실행될 때마다 다시 평가하므로
// 어느 쪽이 늦게 오든 결과는 같다(getFirstEntryRedirectSpaceId.test.ts 참고).
export function WorkspaceBootstrapGate({
  children,
}: WorkspaceBootstrapGateProps) {
  const { data: bootstrap } = useWorkspaceBootstrapQuery();
  const { data: spaceList } = useSpaceList();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const redirected = useRef(false);

  useEffect(
    function redirectFirstEntryToDefaultSpace() {
      if (redirected.current) {
        return;
      }
      const spacePublicId = getFirstEntryRedirectSpaceId(
        bootstrap?.isFirstEntry,
        pathname,
        spaceList?.spaces,
      );
      if (!spacePublicId) {
        return;
      }
      redirected.current = true;
      void navigate({
        to: "/space/$spacePublicId",
        params: { spacePublicId },
        replace: true,
      });
    },
    [bootstrap, spaceList, pathname, navigate],
  );

  return <>{children}</>;
}
