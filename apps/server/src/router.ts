import { router, publicProcedure } from "./trpc.js";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" };
  }),
});

export type AppRouter = typeof appRouter;
