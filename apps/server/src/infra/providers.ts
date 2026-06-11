import { getEnv } from "@server/env";
import type { TieredLlm } from "@server/infra/llm/models";
import {
  createTieredLlm,
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
} from "@server/infra/llm/models";

// v1 저장·검색 파이프 철거로 embedding/vector/graph provider가 비었다.
// v2 동기화 worker(진술 추출·임베딩)가 들어올 때 다시 채운다.
export interface Providers {
  llm: TieredLlm;
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

  cached = {
    llm: createTieredLlm({
      apiKey: env.OPENAI_API_KEY,
      modelStandard: env.LLM_MODEL_STANDARD,
      modelMini: env.LLM_MODEL_MINI,
      modelNano: env.LLM_MODEL_NANO,
    }),
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
