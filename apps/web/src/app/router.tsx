import { Suspense } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

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

import { App } from "./App";

const rootRoute = createRootRoute({
  component: App,
  errorComponent: RouteErrorFallback,
});

const signinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
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

const sessionRoute = createRoute({
  getParentRoute: () => sessionSidebarRoute,
  path: "/session/$sessionId",
  component: SessionPage,
});

const routeTree = rootRoute.addChildren([
  signinRoute,
  privacyRoute,
  termsRoute,
  authenticatedRoute.addChildren([
    sessionSidebarRoute.addChildren([indexRoute, sessionRoute]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
