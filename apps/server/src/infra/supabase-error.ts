export type SupabaseErrorCode =
  | "not_found"
  | "forbidden"
  | "precondition"
  | "query_failed";

const PG_NOT_FOUND = "P0002";
const PGRST_NOT_FOUND = "PGRST116";
const PG_INSUFFICIENT_PRIVILEGE = "42501";
// RPC가 USING ERRCODE로 붙이는 Nema 커스텀 SQLSTATE — "먼저 소유권을 넘겨라" 전제 위반
const NEMA_PRECONDITION = "NM001";

export function toSupabaseErrorCode(pgCode: string): SupabaseErrorCode {
  switch (pgCode) {
    case PG_NOT_FOUND:
    case PGRST_NOT_FOUND:
      return "not_found";
    case PG_INSUFFICIENT_PRIVILEGE:
      return "forbidden";
    case NEMA_PRECONDITION:
      return "precondition";
    default:
      return "query_failed";
  }
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
