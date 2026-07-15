import { TRPCError } from "@trpc/server";

import type { Locale } from "@nema-io/shared";

import { EmbeddingError } from "./infra/embedding/embedding-provider";
import { t, type TranslationKey } from "./infra/i18n";
import { LlmError } from "./infra/llm/llm-error";
import { SupabaseError, type SupabaseErrorCode } from "./infra/supabase-error";
import { VectorStoreError } from "./infra/vector/vector-store";

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

type DomainErrorCode =
  | "LLM_RATE_LIMIT"
  | "LLM_TIMEOUT"
  | "LLM_AUTH"
  | "LLM_BAD_REQUEST"
  | "LLM_CONTENT_FILTER"
  | "LLM_ABORTED"
  | "LLM_ERROR"
  | "EMBEDDING_ERROR"
  | "VECTOR_STORE_ERROR"
  | "DB_NOT_FOUND"
  | "DB_FORBIDDEN"
  | "DB_PRECONDITION"
  | "DB_SPACE_MIN_ONE"
  | "DB_SPACE_NAME_CONFLICT"
  | "DB_SOURCE_STATE_CHANGED"
  | "DB_TOPIC_STATE_CHANGED"
  | "DB_TOPIC_NAME_CONFLICT"
  | "DB_REFERENCE_STATE_CHANGED"
  | "DB_INGESTION_REVIEW_STATE_CHANGED"
  | "DB_SPACE_DELETE_TARGET_REQUIRED"
  | "DB_QUERY_FAILED";

const ERROR_MAP: Record<
  DomainErrorCode,
  { trpcCode: TRPCErrorCode; i18nKey: TranslationKey }
> = {
  LLM_RATE_LIMIT: {
    trpcCode: "TOO_MANY_REQUESTS",
    i18nKey: "error.llm_rate_limit",
  },
  LLM_TIMEOUT: { trpcCode: "TIMEOUT", i18nKey: "error.llm_timeout" },
  LLM_AUTH: { trpcCode: "INTERNAL_SERVER_ERROR", i18nKey: "error.default" },
  LLM_BAD_REQUEST: {
    trpcCode: "BAD_REQUEST",
    i18nKey: "error.llm_bad_request",
  },
  LLM_CONTENT_FILTER: {
    trpcCode: "BAD_REQUEST",
    i18nKey: "error.llm_content_filter",
  },
  // 호출자가 스스로 끊은 것 — 장애가 아니다. 이 매핑이 없으면 LLM_ERROR로 떨어져
  // INTERNAL_SERVER_ERROR + Sentry가 되고, "취소는 실패가 아니다"라는 계약이 provider·
  // 워커 층에서만 지켜지고 API 경계에서 깨진다.
  LLM_ABORTED: {
    trpcCode: "CLIENT_CLOSED_REQUEST",
    i18nKey: "error.llm_aborted",
  },
  LLM_ERROR: {
    trpcCode: "INTERNAL_SERVER_ERROR",
    i18nKey: "error.default",
  },
  EMBEDDING_ERROR: {
    trpcCode: "INTERNAL_SERVER_ERROR",
    i18nKey: "error.default",
  },
  VECTOR_STORE_ERROR: {
    trpcCode: "INTERNAL_SERVER_ERROR",
    i18nKey: "error.default",
  },
  DB_NOT_FOUND: {
    trpcCode: "NOT_FOUND",
    i18nKey: "error.db_not_found",
  },
  DB_FORBIDDEN: {
    trpcCode: "FORBIDDEN",
    i18nKey: "error.forbidden",
  },
  DB_PRECONDITION: {
    trpcCode: "PRECONDITION_FAILED",
    i18nKey: "error.workspace_last_owner",
  },
  DB_SPACE_MIN_ONE: {
    trpcCode: "PRECONDITION_FAILED",
    i18nKey: "error.space_min_one",
  },
  DB_SPACE_NAME_CONFLICT: {
    trpcCode: "CONFLICT",
    i18nKey: "error.space_name_conflict",
  },
  DB_SOURCE_STATE_CHANGED: {
    trpcCode: "CONFLICT",
    i18nKey: "error.source_state_changed",
  },
  DB_TOPIC_STATE_CHANGED: {
    trpcCode: "CONFLICT",
    i18nKey: "error.topic_state_changed",
  },
  DB_TOPIC_NAME_CONFLICT: {
    trpcCode: "CONFLICT",
    i18nKey: "error.topic_name_conflict",
  },
  DB_REFERENCE_STATE_CHANGED: {
    trpcCode: "CONFLICT",
    i18nKey: "error.reference_state_changed",
  },
  DB_INGESTION_REVIEW_STATE_CHANGED: {
    trpcCode: "CONFLICT",
    i18nKey: "error.ingestion_review_state_changed",
  },
  DB_SPACE_DELETE_TARGET_REQUIRED: {
    trpcCode: "PRECONDITION_FAILED",
    i18nKey: "error.space_delete_target_required",
  },
  DB_QUERY_FAILED: {
    trpcCode: "INTERNAL_SERVER_ERROR",
    i18nKey: "error.default",
  },
};

// 사용자에게 도달하는 정상적인 거부(권한·전제·대상 없음)는 시스템 장애가 아니라
// Sentry로 캡처하면 진짜 장애를 묻는다. 미들웨어가 이 판정으로 캡처를 건너뛴다.
const EXPECTED_DOMAIN_CODES = new Set<DomainErrorCode>([
  "DB_NOT_FOUND",
  "DB_FORBIDDEN",
  "DB_PRECONDITION",
  "DB_SPACE_MIN_ONE",
  "DB_SPACE_NAME_CONFLICT",
  "DB_SOURCE_STATE_CHANGED",
  "DB_TOPIC_STATE_CHANGED",
  "DB_TOPIC_NAME_CONFLICT",
  "DB_REFERENCE_STATE_CHANGED",
  "DB_INGESTION_REVIEW_STATE_CHANGED",
  "DB_SPACE_DELETE_TARGET_REQUIRED",
  "LLM_ABORTED",
]);

export function isExpectedDomainError(cause: unknown): boolean {
  const domainCode = getDomainCode(cause);
  return domainCode !== undefined && EXPECTED_DOMAIN_CODES.has(domainCode);
}

const SUPABASE_CODE_MAP: Record<SupabaseErrorCode, DomainErrorCode> = {
  not_found: "DB_NOT_FOUND",
  forbidden: "DB_FORBIDDEN",
  precondition: "DB_PRECONDITION",
  space_min_one: "DB_SPACE_MIN_ONE",
  space_name_conflict: "DB_SPACE_NAME_CONFLICT",
  source_state_changed: "DB_SOURCE_STATE_CHANGED",
  topic_state_changed: "DB_TOPIC_STATE_CHANGED",
  topic_name_conflict: "DB_TOPIC_NAME_CONFLICT",
  reference_state_changed: "DB_REFERENCE_STATE_CHANGED",
  ingestion_review_state_changed: "DB_INGESTION_REVIEW_STATE_CHANGED",
  space_delete_target_required: "DB_SPACE_DELETE_TARGET_REQUIRED",
  query_failed: "DB_QUERY_FAILED",
};

const LLM_CODE_MAP: Record<string, DomainErrorCode> = {
  rate_limit: "LLM_RATE_LIMIT",
  timeout: "LLM_TIMEOUT",
  auth: "LLM_AUTH",
  bad_request: "LLM_BAD_REQUEST",
  content_filter: "LLM_CONTENT_FILTER",
  aborted: "LLM_ABORTED",
};

export function getDomainCode(cause: unknown): DomainErrorCode | undefined {
  if (cause instanceof LlmError) {
    return LLM_CODE_MAP[cause.code] ?? "LLM_ERROR";
  }
  if (cause instanceof EmbeddingError) {
    return "EMBEDDING_ERROR";
  }
  if (cause instanceof VectorStoreError) {
    return "VECTOR_STORE_ERROR";
  }
  if (cause instanceof SupabaseError) {
    return SUPABASE_CODE_MAP[cause.code];
  }
  return undefined;
}

export function mapDomainError(error: unknown, lng: Locale): TRPCError {
  const domainCode = getDomainCode(error);
  if (domainCode) {
    const { trpcCode, i18nKey } = ERROR_MAP[domainCode];
    return new TRPCError({
      code: trpcCode,
      message: t(i18nKey, lng),
      cause: error,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: t("error.default", lng),
    cause: error,
  });
}
