import { devRouter } from "./routers/dev-router";
import { eventRouter } from "./routers/event-router";
import { messageRouter } from "./routers/message-router";
import { profileRouter } from "./routers/profile-router";
import { sessionRouter } from "./routers/session-router";
import { sourceRouter } from "./routers/source-router";
import { statementRouter } from "./routers/statement-router";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" };
  }),
  profile: profileRouter,
  session: sessionRouter,
  message: messageRouter,
  event: eventRouter,
  source: sourceRouter,
  statement: statementRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;
