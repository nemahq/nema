// PostgREST가 .single()/.maybeSingle() 조회에 매칭 행이 없을 때 붙이는 코드.
// RLS(owner-only)로 남의 행을 걸러낸 결과도 이 코드로 온다 — 존재하지 않는 것과
// 소유가 아닌 것을 API 밖으로 구분해 노출하지 않는다(존재 자체를 숨긴다).
const PGRST_NOT_FOUND = "PGRST116";

export class SupabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SupabaseError";
  }
}

export function throwIfSupabaseError(
  error: { code: string; message: string } | null,
): asserts error is null {
  if (error) {
    throw new SupabaseError(error.message, error.code);
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof SupabaseError && error.code === PGRST_NOT_FOUND;
}
