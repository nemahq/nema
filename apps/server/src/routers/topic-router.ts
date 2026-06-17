import { listTopics } from "@server/services/topic-service";
import { protectedProcedure, router } from "@server/trpc";

export const topicRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listTopics({ supabase: ctx.supabase }),
  ),
});
