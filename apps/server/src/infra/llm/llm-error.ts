export type LlmErrorCode =
  | "timeout"
  | "rate_limit"
  | "auth"
  | "bad_request"
  | "content_filter"
  | "unknown";

export class LlmError extends Error {
  override readonly cause?: unknown;

  constructor(
    public readonly code: LlmErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "LlmError";
  }
}
