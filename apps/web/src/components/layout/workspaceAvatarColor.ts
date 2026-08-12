// 팔레트는 흰 텍스트 대비(WCAG AA) 실측을 거친 고정 5색이다 — 후보 중 rose는
// 너무 튀어 제외됐다. 순서·구성을 바꾸려면 design-decisions-log.md
// "워크스페이스 배지 — 개인화 색상 도입" 항목의 대비비 근거부터 다시 볼 것.
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
