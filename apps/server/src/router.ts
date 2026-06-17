import { changesetRouter } from "./routers/changeset-router";
import { devRouter } from "./routers/dev-router";
import { draftRouter } from "./routers/draft-router";
import { eventRouter } from "./routers/event-router";
import { messageRouter } from "./routers/message-router";
import { narrationRouter } from "./routers/narration-router";
import { profileRouter } from "./routers/profile-router";
import { sessionRouter } from "./routers/session-router";
import { sourceRouter } from "./routers/source-router";
import { statementRouter } from "./routers/statement-router";
import { topicRouter } from "./routers/topic-router";
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
  narration: narrationRouter,
  changeset: changesetRouter,
  draft: draftRouter,
  topic: topicRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;
