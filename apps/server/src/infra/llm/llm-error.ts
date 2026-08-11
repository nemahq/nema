export type LlmErrorCode =
  | "timeout"
  | "rate_limit"
  | "auth"
  | "bad_request"
  | "content_filter"
  | "unknown";

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
