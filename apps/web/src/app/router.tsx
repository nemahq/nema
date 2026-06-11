import { Suspense } from "react";
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
import { SignInPage } from "@web/app/pages/SignInPage";
import { TermsPage } from "@web/app/pages/TermsPage";
import { ContentAreaFallback } from "@web/components/layout/ContentAreaFallback";
import { requireAuth, requireGuest } from "@web/features/auth";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";

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
  component: SignInPage,
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
  errorComponent: RouteErrorFallback,
});

function SessionPageShell() {
  const { sessionId } = sessionRoute.useParams();
  return <SessionPage key={sessionId} />;
}

const sessionRoute = createRoute({
  getParentRoute: () => sessionSidebarRoute,
  path: "/session/$sessionId",
  component: SessionPageShell,
  errorComponent: RouteErrorFallback,
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
