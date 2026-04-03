import { devRouter } from "./routers/dev-router";
import { documentRouter } from "./routers/document-router";
import { eventRouter } from "./routers/event-router";
import { messageRouter } from "./routers/message-router";
import { profileRouter } from "./routers/profile-router";
import { saveJobRouter } from "./routers/save-job-router";
import { sessionRouter } from "./routers/session-router";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" };
  }),
  document: documentRouter,
  profile: profileRouter,
  session: sessionRouter,
  message: messageRouter,
  event: eventRouter,
  saveJob: saveJobRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;
