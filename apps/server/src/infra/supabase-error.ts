export type SupabaseErrorCode = "not_found" | "query_failed";

const PG_NOT_FOUND = "P0002";
const PGRST_NOT_FOUND = "PGRST116";

export function toSupabaseErrorCode(pgCode: string): SupabaseErrorCode {
  return pgCode === PG_NOT_FOUND || pgCode === PGRST_NOT_FOUND
    ? "not_found"
    : "query_failed";
}

export function throwIfSupabaseError(
  error: { code: string; message: string } | null,
): asserts error is null {
  if (error) {
    throw new SupabaseError(
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }
}

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
