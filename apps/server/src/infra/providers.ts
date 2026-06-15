import OpenAI from "openai";

import { getEnv } from "@server/env";
import type { EmbeddingProvider } from "@server/infra/embedding";
import { createVoyageProvider } from "@server/infra/embedding";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { getModelSpec } from "@server/infra/llm/model-catalog";
import type { TieredLlm } from "@server/infra/llm/models";
import {
  createTieredLlm,
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
} from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import type { LlmTask } from "@server/infra/llm/task-routing";
import {
  getTaskOverride,
  setTaskOverride,
  TASK_DEFAULT_TIER,
} from "@server/infra/llm/task-routing";
import type { VectorStore } from "@server/infra/vector";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";

// tier 시스템(standard/mini/nano) 위에 task 라우팅을 얹은 LLM 인터페이스(NEM-146).
// tier는 preset 내부 교체용으로 그대로 유지하고, 호출부는 forTask로 task별 모델을 받는다.
export type LlmRouter = TieredLlm & {
  forTask(task: LlmTask): LlmProvider;
};

// 요청 경로(진술 검색)용 provider. 워커는 index.ts에서 직접 조립한다.
// graph(Neo4j)는 관계 엔진과 함께 후속.
export interface Providers {
  llm: LlmRouter;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
}

export type LlmPreset = "all-nano" | "real-tiers";

let cached: Providers | undefined;
let originalLlm: LlmRouter | undefined;
let currentPreset: LlmPreset = "all-nano";
let resolvedModelNames:
  | { standard: string; mini: string; nano: string }
  | undefined;
// override 모델 id별 provider 캐시 — 같은 모델을 task마다 다시 만들지 않는다.
// 공유 OpenAI 클라이언트로 만든다(getProviders 초기화 시 주입).
let overrideProviders: Map<string, LlmProvider> | undefined;
let sharedOpenAiClient: OpenAI | undefined;

// tier 묶음을 forTask가 달린 LlmRouter로 감싼다. forTask 해석:
//  - task override가 있으면 → 카탈로그 모델용 provider(모델별 캐시, 공유 클라이언트 재사용)
//  - 없으면 → 현재 tier(TASK_DEFAULT_TIER). preset이 cached.llm의 tier를 갈아끼우므로
//    기본 경로는 활성 preset을 자동으로 따른다(= 동작 불변).
function toRouter(tiers: TieredLlm): LlmRouter {
  return {
    standard: tiers.standard,
    mini: tiers.mini,
    nano: tiers.nano,
    forTask(task: LlmTask): LlmProvider {
      const overrideModelId = getTaskOverride(task);
      if (overrideModelId) {
        return resolveOverrideProvider(overrideModelId);
      }
      return this[TASK_DEFAULT_TIER[task]];
    },
  };
}

function resolveOverrideProvider(modelId: string): LlmProvider {
  if (!overrideProviders || !sharedOpenAiClient) {
    throw new Error("Providers not initialized");
  }
  const cachedProvider = overrideProviders.get(modelId);
  if (cachedProvider) {
    return cachedProvider;
  }

  const spec = getModelSpec(modelId);
  if (!spec) {
    throw new Error(`Unknown model id "${modelId}" — not in MODEL_CATALOG`);
  }
  // openai만 어댑터가 준비돼 있다. anthropic/google은 NEM-147/148에서 합류한다.
  if (spec.provider !== "openai") {
    throw new Error(
      `Provider "${spec.provider}" for model "${modelId}" is not yet wired (adapter pending — NEM-147/148)`,
    );
  }

  const provider = new OpenAiProvider({
    client: sharedOpenAiClient,
    model: spec.id,
  });
  overrideProviders.set(modelId, provider);
  return provider;
}

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

  const bundle = createTieredLlm({
    apiKey: env.OPENAI_API_KEY,
    modelStandard: env.LLM_MODEL_STANDARD,
    modelMini: env.LLM_MODEL_MINI,
    modelNano: env.LLM_MODEL_NANO,
  });
  sharedOpenAiClient = bundle.openAiClient;
  overrideProviders = new Map();

  cached = {
    llm: toRouter(bundle.tiers),
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
      ? toRouter({
          standard: originalLlm.nano,
          mini: originalLlm.nano,
          nano: originalLlm.nano,
        })
      : originalLlm;
}

// task별 런타임 모델 스위칭(NEM-146) — preset과 같은 prod 잠금을 공유한다.
// 모델 id는 setTaskOverride가 MODEL_CATALOG로 검증한다.
export function setTaskModel(task: LlmTask, modelId: string): void {
  const env = getEnv();
  if (env.APP_ENV === "production") {
    throw new Error("LLM task override is not available in production");
  }
  if (!cached) {
    throw new Error("Providers not initialized");
  }
  setTaskOverride(task, modelId);
}
