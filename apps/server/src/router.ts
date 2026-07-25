import { accountRouter } from "./routers/account-router";
import { changesetRouter } from "./routers/changeset-router";
import { devRouter } from "./routers/dev-router";
import { digestReviewRouter } from "./routers/digest-review-router";
import { digestRouter } from "./routers/digest-router";
import { narrationRouter } from "./routers/narration-router";
import { profileRouter } from "./routers/profile-router";
import { referenceRouter } from "./routers/reference-router";
import { sourceRouter } from "./routers/source-router";
import { spaceRouter } from "./routers/space-router";
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
  source: sourceRouter,
  space: spaceRouter,
  statement: statementRouter,
  narration: narrationRouter,
  changeset: changesetRouter,
  digest: digestRouter,
  digestReview: digestReviewRouter,
  topic: topicRouter,
  tag: tagRouter,
  workspaceMember: workspaceMemberRouter,
  workspace: workspaceRouter,
  reference: referenceRouter,
  account: accountRouter,
  dev: devRouter,
});

export type AppRouter = typeof appRouter;
