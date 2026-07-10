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
  // Supabase User.email은 SDK 타입상 optional(전화번호 인증 등 예외 케이스 대비) —
  // 항상 채워 보내는 대신 없으면 키 자체를 생략한다(avatarUrl과 같은 패턴).
  email: z.string().email().optional(),
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
  // 이 유저 생애 단 한 번만 true — 방금 만든 Space 오버뷰로 보낸다. 서버가
  // 호출마다 원자적으로 소비하므로(mark_first_entry), 같은 유저가 bootstrap을
  // 다시 불러도 이후로는 항상 false. 재시도·폴백에서 다시 true를 기대하면 안 된다.
  // 가입 시점에 Space가 이미 만들어져 있어 "Space 존재"로는 신규/기존을 못 가른다.
  isFirstEntry: z.boolean(),
});
export type WorkspaceBootstrap = z.infer<typeof WorkspaceBootstrapSchema>;
