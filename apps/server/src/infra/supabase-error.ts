export type SupabaseErrorCode = "not_found" | "query_failed";

const PG_NOT_FOUND = "P0002";
const PGRST_NOT_FOUND = "PGRST116";

export function toSupabaseErrorCode(pgCode: string): SupabaseErrorCode {
  return pgCode === PG_NOT_FOUND || pgCode === PGRST_NOT_FOUND
    ? "not_found"
    : "query_failed";
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
