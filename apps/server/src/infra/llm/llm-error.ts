// "aborted"는 호출자가 signal로 스스로 끊은 것 — 프로바이더 장애가 아니다. 별도 코드를
// 두는 이유는 재시도 정책 때문이다: 이게 없으면 abort가 "unknown"으로 분류되고, 워커의
// RETRYABLE_LLM_CODES가 unknown을 재시도 대상에 넣고 있어(일시 장애와 묶여 있다) 방금
// 사람이 취소한 작업을 그대로 3번 더 부른다. 취소는 정의상 재시도하면 안 되는 유일한 실패다.
export type LlmErrorCode =
  | "timeout"
  | "rate_limit"
  | "auth"
  | "bad_request"
  | "content_filter"
  | "aborted"
  | "unknown";

// 결정적 실패(auth/bad_request/content_filter)는 재시도해도 결과가 같다 — 콜 레벨
// 재시도(워커)와 source 단위 lease 재시도가 공유하는 단일 기준.
export const RETRYABLE_LLM_CODES: ReadonlySet<LlmErrorCode> = new Set([
  "timeout",
  "rate_limit",
  "unknown",
]);

export class LlmError extends Error {
  // cause는 Error 기본 필드를 그대로 쓴다. 여기서 필드로 재선언하면
  // useDefineForClassFields(ES2024) 환경에서 super가 채운 cause를 undefined로 덮어쓴다.
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "LlmError";
  }
}

// source 단위 lease 재시도(digestion/extraction/linking 공통)가 쓰는 재시도 상한 결정.
// 결정적 실패는 defaultMax를 다 태우지 않고 1회 만에 종결한다.
export function resolveMaxRetries(err: unknown, defaultMax: number): number {
  return err instanceof LlmError && !RETRYABLE_LLM_CODES.has(err.code)
    ? 1
    : defaultMax;
}
