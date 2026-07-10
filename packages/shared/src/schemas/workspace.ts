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

// 가입 트리거가 만드는 기본 Space의 이름 자리 — en placeholder, ko UX 패스에서 재검토 대상.
export const DEFAULT_SPACE_NAME = "Default";

export const BootstrapUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().optional(),
});
export type BootstrapUser = z.infer<typeof BootstrapUserSchema>;

export const BootstrapWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type BootstrapWorkspace = z.infer<typeof BootstrapWorkspaceSchema>;

export const BootstrapSpaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type BootstrapSpace = z.infer<typeof BootstrapSpaceSchema>;

export const WorkspaceBootstrapSchema = z.object({
  user: BootstrapUserSchema,
  workspace: BootstrapWorkspaceSchema,
  spaces: z.array(BootstrapSpaceSchema),
  // 이 유저의 처음 진입이면 true — 방금 만든 Space 오버뷰로 보낸다. 가입 시점에
  // Space가 이미 만들어져 있어 "Space 존재"로는 신규/기존을 못 가른다.
  isFirstEntry: z.boolean(),
});
export type WorkspaceBootstrap = z.infer<typeof WorkspaceBootstrapSchema>;
