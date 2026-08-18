import { TRPCError } from "@trpc/server";

import type { Locale } from "@nema-io/shared";

import { EmbeddingError } from "@server/infra/embedding";
import { t, type TranslationKey } from "@server/infra/i18n";
import { LlmError } from "@server/infra/llm/llm-error";
import {
  isForbiddenError,
  isNotFoundError,
  SupabaseError,
} from "@server/infra/supabase/supabase-error";
import { VectorStoreError } from "@server/infra/vector";
import { SourceAlreadyProcessingError } from "@server/services/source-service";

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

// legacy(error-mapper.ts)의 도메인 코드 중 이번 세대 스키마에 대응물이 남은 것만
// 옮긴다 — Space·Topic·Reference·Changeset·IngestionReview는 없어진 도메인이라 뺀다.
type DomainErrorCode =
  | "LLM_RATE_LIMIT"
  | "LLM_TIMEOUT"
  | "LLM_BAD_REQUEST"
  | "LLM_CONTENT_FILTER"
  | "LLM_ABORTED"
  | "DB_NOT_FOUND"
  | "DB_FORBIDDEN"
  | "INDEX_UNAVAILABLE"
  | "SOURCE_ALREADY_PROCESSING";

const ERROR_MAP: Record<
  DomainErrorCode,
  { trpcCode: TRPCErrorCode; i18nKey: TranslationKey }
> = {
  LLM_RATE_LIMIT: {
    trpcCode: "TOO_MANY_REQUESTS",
    i18nKey: "error.llm_rate_limit",
  },
  LLM_TIMEOUT: { trpcCode: "TIMEOUT", i18nKey: "error.llm_timeout" },
  LLM_BAD_REQUEST: {
    trpcCode: "BAD_REQUEST",
    i18nKey: "error.llm_bad_request",
  },
  LLM_CONTENT_FILTER: {
    trpcCode: "BAD_REQUEST",
    i18nKey: "error.llm_content_filter",
  },
  // 호출자가 스스로 끊은 것 — 장애가 아니다. llm-error.ts의 LlmErrorCode에 아직
  // "aborted"가 없어 지금은 절대 만들어지지 않지만, 취소 지원이 붙을 때 매핑을
  // 새로 짜지 않도록 자리를 남겨둔다(아래 LLM_CODE_MAP 주석 참고).
  LLM_ABORTED: {
    trpcCode: "CLIENT_CLOSED_REQUEST",
    i18nKey: "error.llm_aborted",
  },
  DB_NOT_FOUND: {
    trpcCode: "NOT_FOUND",
    i18nKey: "error.db_not_found",
  },
  DB_FORBIDDEN: {
    trpcCode: "FORBIDDEN",
    i18nKey: "error.forbidden",
  },
  INDEX_UNAVAILABLE: {
    trpcCode: "SERVICE_UNAVAILABLE",
    i18nKey: "error.index_unavailable",
  },
  SOURCE_ALREADY_PROCESSING: {
    trpcCode: "CONFLICT",
    i18nKey: "error.source_already_processing",
  },
};

// 사용자에게 도달하는 정상적인 거부(권한·대상 없음)는 시스템 장애가 아니다 — 이
// 판정으로 진짜 장애만 서버 로그에 남긴다(onTRPCError, trpc.ts).
const EXPECTED_DOMAIN_CODES = new Set<DomainErrorCode>([
  "DB_NOT_FOUND",
  "DB_FORBIDDEN",
  "LLM_ABORTED",
  "SOURCE_ALREADY_PROCESSING",
]);

export function isExpectedDomainError(cause: unknown): boolean {
  const domainCode = getDomainCode(cause);
  return domainCode !== undefined && EXPECTED_DOMAIN_CODES.has(domainCode);
}

// LlmError.code를 느슨하게(Record<string, ...>) 매핑한다 — "aborted"처럼 아직 LlmError가
// 안 내는 코드를 미리 적어둬도 타입 에러가 안 나, 코드가 늘 때 이 표만 넓히면 된다.
const LLM_CODE_MAP: Record<string, DomainErrorCode> = {
  rate_limit: "LLM_RATE_LIMIT",
  timeout: "LLM_TIMEOUT",
  bad_request: "LLM_BAD_REQUEST",
  content_filter: "LLM_CONTENT_FILTER",
  aborted: "LLM_ABORTED",
};

export function getDomainCode(cause: unknown): DomainErrorCode | undefined {
  if (cause instanceof LlmError) {
    return LLM_CODE_MAP[cause.code];
  }
  if (cause instanceof EmbeddingError || cause instanceof VectorStoreError) {
    return "INDEX_UNAVAILABLE";
  }
  if (cause instanceof SupabaseError) {
    if (isNotFoundError(cause)) {
      return "DB_NOT_FOUND";
    }
    if (isForbiddenError(cause)) {
      return "DB_FORBIDDEN";
    }
    return undefined;
  }
  if (cause instanceof SourceAlreadyProcessingError) {
    return "SOURCE_ALREADY_PROCESSING";
  }
  return undefined;
}

export function mapDomainError(error: unknown, lng: Locale): TRPCError {
  const domainCode = getDomainCode(error);
  if (domainCode) {
    const { trpcCode, i18nKey } = ERROR_MAP[domainCode];
    return new TRPCError({
      code: trpcCode,
      message: t(i18nKey, { lng }),
      cause: error,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: t("error.default", { lng }),
    cause: error,
  });
}
