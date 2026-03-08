import { TRPCError } from "@trpc/server";

import type { Locale } from "@nema-io/shared";

import { EmbeddingError } from "./infra/embedding/embedding-provider";
import { GraphStoreError } from "./infra/graph/graph-store";
import { t } from "./infra/i18n";
import { LlmError } from "./infra/llm/llm-error";
import { VectorStoreError } from "./infra/vector/vector-store";

export function mapDomainError(error: unknown, lng: Locale): TRPCError {
  if (error instanceof LlmError) {
    switch (error.code) {
      case "rate_limit":
        return new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: t("error.llm_rate_limit", lng),
          cause: error,
        });
      case "timeout":
        return new TRPCError({
          code: "TIMEOUT",
          message: t("error.llm_timeout", lng),
          cause: error,
        });
      default:
        return new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: t("error.llm_default", lng),
          cause: error,
        });
    }
  }

  if (error instanceof EmbeddingError) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: t("error.embedding", lng),
      cause: error,
    });
  }

  if (error instanceof VectorStoreError) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: t("error.vector_store", lng),
      cause: error,
    });
  }

  if (error instanceof GraphStoreError) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: t("error.graph_store", lng),
      cause: error,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: t("error.unknown", lng),
    cause: error,
  });
}
