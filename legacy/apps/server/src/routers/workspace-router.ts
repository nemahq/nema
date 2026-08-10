import { bootstrapWorkspace } from "@server/services/workspace-service";
import { protectedProcedure, router } from "@server/trpc";

export const workspaceRouter = router({
  bootstrap: protectedProcedure.query(({ ctx }) =>
    bootstrapWorkspace({ supabase: ctx.supabase, user: ctx.user }),
  ),
});
