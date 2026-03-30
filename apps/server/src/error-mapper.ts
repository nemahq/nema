import { TRPCError } from "@trpc/server";

import type { Locale } from "@nema-io/shared";

import { EmbeddingError } from "./infra/embedding/embedding-provider";
import { GraphStoreError } from "./infra/graph/graph-store";
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
  | "LLM_ERROR"
  | "EMBEDDING_ERROR"
  | "VECTOR_STORE_ERROR"
  | "GRAPH_STORE_ERROR"
  | "DB_NOT_FOUND"
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
  GRAPH_STORE_ERROR: {
    trpcCode: "INTERNAL_SERVER_ERROR",
    i18nKey: "error.default",
  },
  DB_NOT_FOUND: {
    trpcCode: "NOT_FOUND",
    i18nKey: "error.db_not_found",
  },
  DB_QUERY_FAILED: {
    trpcCode: "INTERNAL_SERVER_ERROR",
    i18nKey: "error.default",
  },
};

const SUPABASE_CODE_MAP: Record<SupabaseErrorCode, DomainErrorCode> = {
  not_found: "DB_NOT_FOUND",
  query_failed: "DB_QUERY_FAILED",
};

const LLM_CODE_MAP: Record<string, DomainErrorCode> = {
  rate_limit: "LLM_RATE_LIMIT",
  timeout: "LLM_TIMEOUT",
  auth: "LLM_AUTH",
  bad_request: "LLM_BAD_REQUEST",
  content_filter: "LLM_CONTENT_FILTER",
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
  if (cause instanceof GraphStoreError) {
    return "GRAPH_STORE_ERROR";
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
