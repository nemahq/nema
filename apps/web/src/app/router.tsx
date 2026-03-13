import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { getQueryKey } from "@trpc/react-query";

import { RouteErrorFallback } from "@web/app/error/RouteErrorFallback";
import { AppLayout } from "@web/app/layouts/AppLayout";
import { SidebarLayout } from "@web/app/layouts/SidebarLayout";
import { ChatPage } from "@web/app/pages/ChatPage";
import { PrivacyPage } from "@web/app/pages/PrivacyPage";
import { SessionPage } from "@web/app/pages/SessionPage";
import { TermsPage } from "@web/app/pages/TermsPage";
import { AuthPage } from "@web/features/auth/components/AuthPage";
import { SESSION_LIST_LIMIT } from "@web/features/session/constants";
import { queryClient } from "@web/lib/queryClient";
import { getAccessToken, supabase } from "@web/lib/supabase";
import { trpc, trpcClient } from "@web/lib/trpc";

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
  beforeLoad() {
    if (!getAccessToken()) {
      return;
    }

    const prefetchPromise = queryClient.prefetchInfiniteQuery({
      queryKey: getQueryKey(
        trpc.session.list,
        { limit: SESSION_LIST_LIMIT },
        "infinite",
      ),
      queryFn: () =>
        trpcClient.session.list.query({ limit: SESSION_LIST_LIMIT }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (
        lastPage: Awaited<ReturnType<typeof trpcClient.session.list.query>>,
      ) => lastPage.nextCursor ?? undefined,
    });

    if (import.meta.env.DEV) {
      prefetchPromise.catch((error: unknown) => {
        console.warn("[prefetch] Session list prefetch failed:", error);
      });
    }
  },
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
