const WORKSPACE_AVATAR_COLOR_CLASSES = [
  "bg-identity-violet",
  "bg-identity-fuchsia",
  "bg-identity-cyan",
  "bg-identity-lime",
  "bg-identity-yellow",
];

export function getWorkspaceAvatarColorClass(workspaceId: string): string {
  let hash = 0;
  for (let i = 0; i < workspaceId.length; i++) {
    hash = (hash * 31 + workspaceId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % WORKSPACE_AVATAR_COLOR_CLASSES.length;
  return WORKSPACE_AVATAR_COLOR_CLASSES[index];
}
