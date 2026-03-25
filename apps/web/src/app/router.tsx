import { Suspense, useState } from "react";
import { z } from "zod";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { NotFoundErrorFallback } from "@web/app/error/NotFoundErrorFallback";
import { RouteErrorFallback } from "@web/app/error/RouteErrorFallback";
import { AppLayout } from "@web/app/layouts/AppLayout";
import { HomePage } from "@web/app/pages/HomePage";
import { PrivacyPage } from "@web/app/pages/PrivacyPage";
import { SessionPage } from "@web/app/pages/SessionPage";
import { TermsPage } from "@web/app/pages/TermsPage";
import { ContentAreaFallback } from "@web/components/layout/ContentAreaFallback";
import { AuthPage } from "@web/features/auth/components/AuthPage";
import { requireAuth, requireGuest } from "@web/features/auth/guards";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";
import { MAX_ALIVE_SESSIONS } from "@web/features/session/constants";
import { SessionIdProvider } from "@web/features/session/contexts/SessionIdContext";
import { VisibilityProvider } from "@web/lib/visibility";

import { App } from "./App";

const rootRoute = createRootRoute({
  component: App,
  errorComponent: RouteErrorFallback,
});

// -- 공개 라우트 --

const signinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  component: AuthPage,
  beforeLoad: requireGuest,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: TermsPage,
});

// -- 인증 라우트 --

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: AppLayout,
  beforeLoad: ({ location }) => requireAuth(location.href),
});

const sessionSidebarRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "_sessionSidebar",
  component: () => (
    <>
      <SessionSidebar />
      <Suspense fallback={<ContentAreaFallback />}>
        <Outlet />
      </Suspense>
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => sessionSidebarRoute,
  path: "/",
  component: HomePage,
});

function useRecentIds(currentId: string) {
  const [ids, setIds] = useState<string[]>([currentId]);
  const [prevId, setPrevId] = useState(currentId);

  if (prevId !== currentId) {
    setPrevId(currentId);
    setIds((prev) => {
      const without = prev.filter((id) => id !== currentId);
      return [...without, currentId].slice(-MAX_ALIVE_SESSIONS);
    });
  }

  return ids;
}

function SessionPageShell() {
  const { sessionId } = sessionRoute.useParams();
  const recentIds = useRecentIds(sessionId);

  return (
    <>
      {recentIds.map((id) => (
        <VisibilityProvider key={id} visible={id === sessionId}>
          <SessionIdProvider sessionId={id}>
            <div hidden={id !== sessionId} className="contents">
              <Suspense fallback={<ContentAreaFallback />}>
                <SessionPage />
              </Suspense>
            </div>
          </SessionIdProvider>
        </VisibilityProvider>
      ))}
    </>
  );
}

const sessionRoute = createRoute({
  getParentRoute: () => sessionSidebarRoute,
  path: "/session/$sessionId",
  component: SessionPageShell,
});

const routeTree = rootRoute.addChildren([
  signinRoute,
  privacyRoute,
  termsRoute,
  authenticatedRoute.addChildren([
    sessionSidebarRoute.addChildren([indexRoute, sessionRoute]),
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundErrorFallback,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
