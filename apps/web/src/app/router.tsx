import {
  createRouter,
  createRootRoute,
  createRoute,
} from "@tanstack/react-router";
import { T } from "@tolgee/react";
import { App } from "./App.js";

const rootRoute = createRootRoute({ component: App });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <p>
      <T keyName="common.home" defaultValue="홈" />
    </p>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
