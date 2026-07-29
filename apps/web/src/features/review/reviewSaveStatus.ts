import { TRPCClientError } from "@trpc/client";

import { getErrorMessage } from "@web/lib/getErrorMessage";

export type ReviewSaveStatus =
  | { kind: "clean"; savedAt: string }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string };

type ReviewSaveFailure = Exclude<ReviewSaveStatus, { kind: "clean" }>;

// CONFLICT는 이 화면의 저장 경로에서 여러 원인(예: ingestion_review_state_changed,
// ingestion_review_version_conflict)을 아우르지만, 전부 "저장하는 동안 서버 쪽 상태가
// 이미 달라졌다"는 같은 뜻이라 새로고침 유도로 묶는다. 서버가 이미 상황에 맞는 안내
// 문구를 i18n으로 실어 보내므로(error.message) 여기서 문구를 새로 짓지 않고 그대로 쓴다.
export function classifyReviewSaveError(error: unknown): ReviewSaveFailure {
  if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
    return { kind: "conflict", message: error.message };
  }
  return { kind: "error", message: getErrorMessage(error) };
}
