import { TRPCClientError } from "@trpc/client";

// useDeleteAccount(Sentry 캡처 제외 판별)와 settings의 AccountDeleteFlow(레이스 시
// 차단 목록 재조회 트리거 + 에러 배너 종류 판별) 양쪽에서 쓴다.
export function isPreconditionFailed(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    error.data?.code === "PRECONDITION_FAILED"
  );
}
