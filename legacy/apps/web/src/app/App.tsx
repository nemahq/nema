import { useEffect } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

import { DevToolbar } from "@web/app/components/devtools/DevToolbar";
import { getEnv } from "@web/app/env";
import { useAuth } from "@web/lib/auth";

const SHOW_DEV_TOOLBAR = getEnv().APP_ENV === "local";

export function App() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const matches = useRouterState({ select: (state) => state.matches });

  // 로그아웃 버튼 클릭은 각 메뉴가 직접 navigate하지만, 토큰 만료·다른 탭
  // 로그아웃처럼 세션이 수동 로그아웃 없이 사라지는 경우는 이게 유일한
  // /signin 이동 경로다 — requireAuth는 beforeLoad라 이미 마운트된
  // 인증 라우트에서는 세션 소실을 스스로 감지하지 못한다.
  useEffect(
    function redirectOnSessionLoss() {
      if (loading || user) {
        return;
      }
      const onAuthenticatedRoute = matches.some(
        (match) => match.routeId === "/_authenticated",
      );
      if (onAuthenticatedRoute) {
        void navigate({ to: "/signin" });
      }
    },
    [loading, user, matches, navigate],
  );

  return (
    <>
      <Outlet />
      {SHOW_DEV_TOOLBAR && user && <DevToolbar />}
    </>
  );
}
