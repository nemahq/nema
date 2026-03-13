import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import { RouteErrorFallback } from "@web/app/error/RouteErrorFallback";
import { AppLayout } from "@web/app/layouts/AppLayout";
import { SidebarLayout } from "@web/app/layouts/SidebarLayout";
import { ChatPage } from "@web/app/pages/ChatPage";
import { PrivacyPage } from "@web/app/pages/PrivacyPage";
import { SessionPage } from "@web/app/pages/SessionPage";
import { TermsPage } from "@web/app/pages/TermsPage";
import { AuthPage } from "@web/features/auth/components/AuthPage";
import { supabase } from "@web/lib/supabase";

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
  async beforeLoad() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw new Error(error.message);
    }
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
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
  async beforeLoad({ location }) {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw new Error(error.message);
    }
    if (!data.session) {
      throw redirect({
        to: "/signin",
        search: { redirect: location.href },
      });
    }
  },
});

const sidebarRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "_sidebar",
  component: SidebarLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: "/",
  component: SessionPage,
});

const sessionRoute = createRoute({
  getParentRoute: () => sidebarRoute,
  path: "/context/$sessionId",
  component: ChatPage,
});

const routeTree = rootRoute.addChildren([
  signinRoute,
  privacyRoute,
  termsRoute,
  authenticatedRoute.addChildren([
    sidebarRoute.addChildren([indexRoute, sessionRoute]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
