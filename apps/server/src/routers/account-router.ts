import { deleteAccount } from "@server/services/account-service";
import { protectedProcedure, router } from "@server/trpc";

export const accountRouter = router({
  delete: protectedProcedure.mutation(({ ctx }) =>
    deleteAccount({ userId: ctx.user.id }),
  ),
});
