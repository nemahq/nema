import {
  LeaveWorkspaceInputSchema,
  UpdateWorkspaceMemberRoleInputSchema,
  WorkspaceMemberListInputSchema,
} from "@nema-io/shared";

import {
  leaveWorkspace,
  listWorkspaceMembers,
  updateWorkspaceMemberRole,
} from "@server/services/workspace-member-service";
import { protectedProcedure, router } from "@server/trpc";

export const workspaceMemberRouter = router({
  list: protectedProcedure
    .input(WorkspaceMemberListInputSchema)
    .query(({ ctx, input }) =>
      listWorkspaceMembers({
        supabase: ctx.supabase,
        workspaceId: input.workspaceId,
      }),
    ),

  updateRole: protectedProcedure
    .input(UpdateWorkspaceMemberRoleInputSchema)
    .mutation(({ ctx, input }) =>
      updateWorkspaceMemberRole({
        supabase: ctx.supabase,
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
      }),
    ),

  leave: protectedProcedure
    .input(LeaveWorkspaceInputSchema)
    .mutation(({ ctx, input }) =>
      leaveWorkspace({
        supabase: ctx.supabase,
        workspaceId: input.workspaceId,
      }),
    ),
});
