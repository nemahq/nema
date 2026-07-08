import { z } from "zod";

export const WORKSPACE_ROLES = ["owner", "member"] as const;

export const WorkspaceRoleSchema = z.enum(WORKSPACE_ROLES);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const WorkspaceMemberSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: WorkspaceRoleSchema,
  createdAt: z.string().datetime({ offset: true }),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const WorkspaceMemberListInputSchema = z.object({
  workspaceId: z.string().uuid(),
});
export type WorkspaceMemberListInput = z.infer<
  typeof WorkspaceMemberListInputSchema
>;

export const UpdateWorkspaceMemberRoleInputSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: WorkspaceRoleSchema,
});
export type UpdateWorkspaceMemberRoleInput = z.infer<
  typeof UpdateWorkspaceMemberRoleInputSchema
>;

export const LeaveWorkspaceInputSchema = z.object({
  workspaceId: z.string().uuid(),
});
export type LeaveWorkspaceInput = z.infer<typeof LeaveWorkspaceInputSchema>;
