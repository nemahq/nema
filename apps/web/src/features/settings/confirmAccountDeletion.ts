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
