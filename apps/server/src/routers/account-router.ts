import {
  deleteAccount,
  getAccountDeletionBlockers,
} from "@server/services/account-service";
import { protectedProcedure, router } from "@server/trpc";

export const accountRouter = router({
  deletionBlockers: protectedProcedure.query(({ ctx }) =>
    getAccountDeletionBlockers({ supabase: ctx.supabase, userId: ctx.user.id }),
  ),

  delete: protectedProcedure.mutation(({ ctx }) =>
    deleteAccount({ supabase: ctx.supabase, userId: ctx.user.id }),
  ),
});
