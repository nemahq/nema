import { TopicIdInputSchema, TopicUpdateInputSchema } from "@nema-io/shared";

import {
  archiveTopic,
  listTopics,
  restoreTopic,
  updateTopic,
} from "@server/services/topic-service";
import { protectedProcedure, router } from "@server/trpc";

export const topicRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listTopics({ supabase: ctx.supabase }),
  ),

  update: protectedProcedure
    .input(TopicUpdateInputSchema)
    .mutation(({ ctx, input }) =>
      updateTopic({ supabase: ctx.supabase, id: input.id, name: input.name }),
    ),

  archive: protectedProcedure
    .input(TopicIdInputSchema)
    .mutation(({ ctx, input }) =>
      archiveTopic({ supabase: ctx.supabase, id: input.id }),
    ),

  restore: protectedProcedure
    .input(TopicIdInputSchema)
    .mutation(({ ctx, input }) =>
      restoreTopic({ supabase: ctx.supabase, id: input.id }),
    ),
});
