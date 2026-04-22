import { devRouter } from "./routers/dev-router";
import { documentRouter } from "./routers/document-router";
import { entityRouter } from "./routers/entity-router";
import { eventRouter } from "./routers/event-router";
import { historyRouter } from "./routers/history-router";
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
  entity: entityRouter,
  profile: profileRouter,
  session: sessionRouter,
  message: messageRouter,
  event: eventRouter,
  saveJob: saveJobRouter,
  history: historyRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;
