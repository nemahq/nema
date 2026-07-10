import { accountRouter } from "./routers/account-router";
import { changesetRouter } from "./routers/changeset-router";
import { devRouter } from "./routers/dev-router";
import { digestReviewRouter } from "./routers/digest-review-router";
import { digestRouter } from "./routers/digest-router";
import { eventRouter } from "./routers/event-router";
import { messageRouter } from "./routers/message-router";
import { narrationRouter } from "./routers/narration-router";
import { profileRouter } from "./routers/profile-router";
import { sessionRouter } from "./routers/session-router";
import { sourceRouter } from "./routers/source-router";
import { statementRouter } from "./routers/statement-router";
import { tagRouter } from "./routers/tag-router";
import { topicRouter } from "./routers/topic-router";
import { workspaceMemberRouter } from "./routers/workspace-member-router";
import { workspaceRouter } from "./routers/workspace-router";
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
  digest: digestRouter,
  digestReview: digestReviewRouter,
  topic: topicRouter,
  tag: tagRouter,
  workspaceMember: workspaceMemberRouter,
  workspace: workspaceRouter,
  account: accountRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;
