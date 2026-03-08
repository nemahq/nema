import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";

import { PrivacyPage } from "@web/app/pages/PrivacyPage";
import { TermsPage } from "@web/app/pages/TermsPage";
import { Button } from "@web/components/ui/button";
import { AuthPage } from "@web/features/auth/components/AuthPage";
import { supabase } from "@web/lib/supabase";
import { useTranslation } from "@web/lib/tolgee";

import { App } from "./App";

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

function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <p>{t("common.home")}</p>
      <Button
        variant="outline"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/signin", search: { redirect: undefined } });
        }}
      >
        로그아웃
      </Button>
    </div>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: HomePage,
});

const routeTree = rootRoute.addChildren([
  signinRoute,
  privacyRoute,
  termsRoute,
  authenticatedRoute.addChildren([indexRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
