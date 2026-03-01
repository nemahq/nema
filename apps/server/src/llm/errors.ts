export type LlmErrorCode = "timeout" | "rate_limit" | "auth" | "unknown";

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "LlmError";
  }
}
