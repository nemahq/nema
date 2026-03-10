import { sessionRouter } from "./routers/session-router";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" };
  }),
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
