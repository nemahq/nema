import { TRPCClientError } from "@trpc/client";

export type AccountDeleteError = "precondition" | "other" | null;

// AccountDeleteFlow가 두 군데에서 쓴다: ① 확인 화면을 보여준 뒤 다른 멤버가 있는
// 워크스페이스에서 내가 유일한 owner가 된 레이스를 구분해 차단 목록을 다시 조회하도록
// 게이팅 화면으로 되돌리는 트리거, ② 삭제 실패 시 배너를 precondition 경고와 그 외
// 일반 에러 중 어느 쪽으로 보여줄지 판별하는 deleteErrorKind()의 분기 기준.
export function isPreconditionFailed(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    error.data?.code === "PRECONDITION_FAILED"
  );
}

// 이메일 없는 계정(전화번호 인증 등)에서 확인 자체가 영원히 불가능해지는 것을 막는다.
export function resolveConfirmationTarget(
  userEmail: string,
  userDisplayName: string,
): string {
  const email = userEmail.trim();
  return email.length > 0 ? email : userDisplayName.trim();
}

// target이 비면 무조건 false — 빈 문자열끼리 매칭돼 삭제 확인이 우회되던
// 버그(리뷰에서 발견)의 재발을 막는 안전장치.
export function canConfirmAccountDeletion(
  input: string,
  confirmationTarget: string,
): boolean {
  const target = confirmationTarget.trim().toLowerCase();
  if (target.length === 0) {
    return false;
  }
  return input.trim().toLowerCase() === target;
}
