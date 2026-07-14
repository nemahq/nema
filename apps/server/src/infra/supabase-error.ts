export type SupabaseErrorCode =
  | "not_found"
  | "forbidden"
  | "precondition"
  | "space_min_one"
  | "space_name_conflict"
  | "source_state_changed"
  | "topic_state_changed"
  | "topic_name_conflict"
  | "query_failed";

const PG_NOT_FOUND = "P0002";
const PGRST_NOT_FOUND = "PGRST116";
const PG_INSUFFICIENT_PRIVILEGE = "42501";
// RPC가 USING ERRCODE로 붙이는 Nema 커스텀 SQLSTATE — "먼저 소유권을 넘겨라" 전제 위반
const NEMA_PRECONDITION = "NM001";
// Space 최소 1개 위반(delete_space) — workspace_last_owner와 같은 결의 전제 위반이지만
// 메시지가 달라 코드를 따로 둔다(하나의 SupabaseErrorCode는 error-mapper에서 고정
// i18n 메시지 하나에 매핑되므로, 코드를 공유하면 메시지가 뒤섞인다).
const NEMA_SPACE_MIN_ONE = "NM002";
// Space 이름 중복(create_space·rename_space) — 원본 unique_violation(23505) 그대로
// 두면 나중에 이 테이블에 다른 unique 제약이 생겨도 전부 "이름 중복"으로 오매핑되니,
// RPC가 제약 이름을 확인한 뒤에만 이 커스텀 코드로 바꿔 던진다.
const NEMA_SPACE_NAME_CONFLICT = "NM003";
// 초안 액션(취소·삭제·Digest 추출 실행)의 상태 가드 실패 — 셋 다 "이 초안이 그 사이 다른
// 상태로 갔다"는 한 가지 사실이라 코드를 쪼개지 않는다(취소하려는데 이미 끝났음, 이미
// 취소된 걸 또 취소, 리뷰가 열린 뒤 재추출 클릭, 처리 중인데 삭제 클릭 — 전부 같은 말).
// 장애가 아니라 정상적인 동시성 결과라 Sentry로 올리지 않는다(EXPECTED_DOMAIN_CODES).
const NEMA_SOURCE_STATE_CHANGED = "NM004";
// Topic 상태 가드 실패(update/archive/restore) — NM004와 같은 "그 사이 상태가
// 바뀜" 결이지만 엔티티가 달라 메시지가 다르므로 코드를 나눈다.
const NEMA_TOPIC_STATE_CHANGED = "NM005";
// Topic 이름 중복(update_topic) — NM003(Space 이름 중복)과 같은 결.
const NEMA_TOPIC_NAME_CONFLICT = "NM006";

export function toSupabaseErrorCode(pgCode: string): SupabaseErrorCode {
  switch (pgCode) {
    case PG_NOT_FOUND:
    case PGRST_NOT_FOUND:
      return "not_found";
    case PG_INSUFFICIENT_PRIVILEGE:
      return "forbidden";
    case NEMA_PRECONDITION:
      return "precondition";
    case NEMA_SPACE_MIN_ONE:
      return "space_min_one";
    case NEMA_SPACE_NAME_CONFLICT:
      return "space_name_conflict";
    case NEMA_SOURCE_STATE_CHANGED:
      return "source_state_changed";
    case NEMA_TOPIC_STATE_CHANGED:
      return "topic_state_changed";
    case NEMA_TOPIC_NAME_CONFLICT:
      return "topic_name_conflict";
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
