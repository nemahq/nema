export type SupabaseErrorCode = "not_found" | "query_failed";

export class SupabaseError extends Error {
  override readonly cause?: unknown;

  constructor(
    public readonly code: SupabaseErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "SupabaseError";
  }
}
