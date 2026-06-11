import { getEnv } from "@server/env";
import type { EmbeddingProvider } from "@server/infra/embedding";
import { createVoyageProvider } from "@server/infra/embedding";
import type { TieredLlm } from "@server/infra/llm/models";
import {
  createTieredLlm,
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
} from "@server/infra/llm/models";
import type { VectorStore } from "@server/infra/vector";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";

// 요청 경로(진술 검색)용 provider. 워커는 index.ts에서 직접 조립한다.
// graph(Neo4j)는 관계 엔진과 함께 후속.
export interface Providers {
  llm: TieredLlm;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
}

export type LlmPreset = "all-nano" | "real-tiers";

let cached: Providers | undefined;
let originalLlm: TieredLlm | undefined;
let currentPreset: LlmPreset = "all-nano";
let resolvedModelNames:
  | { standard: string; mini: string; nano: string }
  | undefined;

export function getProviders(): Providers {
  if (cached) {
    return cached;
  }

  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for chat");
  }
  if (!env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is required for chat");
  }
  if (!env.QDRANT_URL || !env.QDRANT_API_KEY) {
    throw new Error("QDRANT_URL and QDRANT_API_KEY are required for chat");
  }

  cached = {
    llm: createTieredLlm({
      apiKey: env.OPENAI_API_KEY,
      modelStandard: env.LLM_MODEL_STANDARD,
      modelMini: env.LLM_MODEL_MINI,
      modelNano: env.LLM_MODEL_NANO,
    }),
    embedding: createVoyageProvider({ apiKey: env.VOYAGE_API_KEY }),
    vectorStore: createQdrantStore(createQdrantClient()),
  };

  // prod 전용 잠금 — 프로덕션에서 모델 프리셋 교체가 열리면 비용·보안 사고로 이어진다
  if (env.APP_ENV !== "production") {
    originalLlm = cached.llm;
    resolvedModelNames = {
      standard: env.LLM_MODEL_STANDARD ?? DEFAULT_STANDARD_MODEL,
      mini: env.LLM_MODEL_MINI ?? DEFAULT_MINI_MODEL,
      nano: env.LLM_MODEL_NANO ?? DEFAULT_NANO_MODEL,
    };
    applyLlmPreset("all-nano");
  }

  return cached;
}

export interface LlmPresetInfo {
  preset: LlmPreset;
  models: { standard: string; mini: string; nano: string };
}

export function getLlmPreset(): LlmPresetInfo {
  if (!resolvedModelNames) {
    throw new Error("LLM preset info not available");
  }
  const models =
    currentPreset === "all-nano"
      ? {
          standard: resolvedModelNames.nano,
          mini: resolvedModelNames.nano,
          nano: resolvedModelNames.nano,
        }
      : resolvedModelNames;
  return { preset: currentPreset, models };
}

export function setLlmPreset(preset: LlmPreset): void {
  const env = getEnv();
  if (env.APP_ENV === "production") {
    throw new Error("LLM preset override is not available in production");
  }
  if (!cached || !originalLlm) {
    throw new Error("Providers not initialized");
  }
  applyLlmPreset(preset);
}

function applyLlmPreset(preset: LlmPreset): void {
  if (!cached || !originalLlm) {
    throw new Error("applyLlmPreset called before providers initialized");
  }
  currentPreset = preset;
  cached.llm =
    preset === "all-nano"
      ? {
          standard: originalLlm.nano,
          mini: originalLlm.nano,
          nano: originalLlm.nano,
        }
      : originalLlm;
}
