import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { T } from "@tolgee/react";
import { Button } from "../components/ui/button.js";
import { supabase } from "../lib/supabase.js";
import { App } from "./App.js";
import { AuthPage } from "../features/auth/components/AuthPage.js";

const rootRoute = createRootRoute({ component: App });

const signinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  component: AuthPage,
  async beforeLoad() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: Outlet,
  async beforeLoad({ location }) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/signin",
        search: { redirect: location.href },
      });
    }
  },
});

const indexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: () => (
    <div className="flex flex-col items-center gap-4 p-8">
      <p>
        <T keyName="common.home" defaultValue="홈" />
      </p>
      <Button
        variant="outline"
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.href = "/signin";
        }}
      >
        로그아웃
      </Button>
    </div>
  ),
});

const routeTree = rootRoute.addChildren([
  signinRoute,
  authenticatedRoute.addChildren([indexRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
