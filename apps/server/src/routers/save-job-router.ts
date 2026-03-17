import type { SaveJob } from "@nema-io/shared";
import {
  EnqueueSaveInputSchema,
  MessageSchema,
  RetrySaveInputSchema,
  STATUS_LOG_TYPES,
} from "@nema-io/shared";

import { onSaveJobUpdate } from "@server/infra/save-job-emitter";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  enqueueSaveJob,
  listRecentSaveJobs,
  processSaveJobBackground,
  retrySaveJob,
} from "@server/services/save-job-service";
import { protectedProcedure, providerProcedure, router } from "@server/trpc";

export const saveJobRouter = router({
  enqueue: providerProcedure
    .input(EnqueueSaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await enqueueSaveJob({
        supabase: ctx.supabase,
        userId: ctx.user.id,
        sessionId: input.sessionId,
      });

      const statusMessage = MessageSchema.parse({
        id: crypto.randomUUID(),
        role: "assistant",
        type: "status",
        content: STATUS_LOG_TYPES.DRAFT_SAVED,
        createdAt: new Date().toISOString(),
      });

      const { error } = await ctx.supabase.rpc("append_message", {
        p_session_id: input.sessionId,
        p_message: statusMessage,
      });

      throwIfSupabaseError(error);

      void processSaveJobBackground({
        supabase: ctx.supabase,
        providers: ctx.providers,
        userId: ctx.user.id,
        jobId: job.id,
      });

      return job;
    }),

  retry: providerProcedure
    .input(RetrySaveInputSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await retrySaveJob({
        supabase: ctx.supabase,
        jobId: input.jobId,
      });

      void processSaveJobBackground({
        supabase: ctx.supabase,
        providers: ctx.providers,
        userId: ctx.user.id,
        jobId: job.id,
      });

      return job;
    }),

  list: protectedProcedure.query(({ ctx }) =>
    listRecentSaveJobs({ supabase: ctx.supabase }),
  ),

  onUpdate: protectedProcedure.subscription(async function* ({ ctx }) {
    const userId = ctx.user.id;
    const queue: SaveJob[] = [];
    let resolve: (() => void) | null = null;

    const unsubscribe = onSaveJobUpdate(userId, (job) => {
      queue.push(job);
      resolve?.();
    });

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
          resolve = null;
        }
        while (queue.length > 0) {
          const job = queue.shift();
          if (job) {
            yield { type: "job_update" as const, job };
          }
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});
