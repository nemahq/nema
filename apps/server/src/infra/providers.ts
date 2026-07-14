import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import * as Sentry from "@sentry/node";

import { getEnv } from "@server/env";
import type { EmbeddingProvider } from "@server/infra/embedding";
import { createVoyageProvider } from "@server/infra/embedding";
import { LlmError } from "@server/infra/llm/llm-error";
import type {
  GenerateStreamParams,
  GenerateStructuredParams,
  GenerateTextParams,
  LlmEffort,
  LlmProvider,
} from "@server/infra/llm/llm-provider";
import {
  getModelSpec,
  type LlmProviderId,
} from "@server/infra/llm/model-catalog";
import type { ProviderClients } from "@server/infra/llm/model-factory";
import {
  createGeminiClient,
  createProviderForModel,
  createTieredLlm,
} from "@server/infra/llm/model-factory";
import type { TieredLlm, TierModelIds } from "@server/infra/llm/models";
import {
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
  resolveTierModelIds,
} from "@server/infra/llm/models";
import { DEFAULT_TIMEOUT_MS as OPENAI_DEFAULT_TIMEOUT_MS } from "@server/infra/llm/openai-provider";
import type { LlmTask } from "@server/infra/llm/task-routing";
import {
  getAllTaskOverrides,
  getTaskOverride,
  setTaskOverride,
  TASK_DEFAULTS,
} from "@server/infra/llm/task-routing";
import type { VectorStore } from "@server/infra/vector";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";

// tier 시스템(standard/mini/nano) 위에 task 라우팅을 얹은 LLM 인터페이스.
// tier는 라우터 내부 구현 디테일이라 밖으로 내보내지 않는다 — 호출부가 .standard로
// task 라우팅(+런타임 스위칭)을 우회하는 길을 막아, 모든 호출이 forTask를 거치게 한다.
export type LlmRouter = {
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
// preset 교체가 되돌릴 원본 tier. router가 tier를 노출하지 않으므로 TieredLlm으로 보관한다.
let originalTiers: TieredLlm | undefined;
let currentPreset: LlmPreset = "all-nano";
let resolvedModelNames:
  | { standard: string; mini: string; nano: string }
  | undefined;
// override 모델 id별 provider 캐시 — 같은 모델을 task마다 다시 만들지 않는다.
// 공유 OpenAI 클라이언트로 만든다(getProviders 초기화 시 주입).
let overrideProviders: Map<string, LlmProvider> | undefined;
let sharedOpenAiClient: OpenAI | undefined;
// anthropic 어댑터용 공유 클라이언트 — anthropic 모델이 처음 요청될 때 만든다.
// 키가 없으면 그 시점에 LlmError("auth")로 끊는다(서버 부팅은 키 없이도 가능).
let sharedAnthropicClient: Anthropic | undefined;
// gemini 어댑터용 공유 클라이언트 — GEMINI_VERTEX_PROJECT 있으면 Vertex(ADC), 없으면 AI Studio(apiKey).
// createGeminiClient가 선택한다(첫 요청 시 생성, 키 없이도 서버 부팅 가능).
let sharedGeminiClient: GoogleGenAI | undefined;

// 부수효과 없는 키 존재 검사 — forTask 가드와 부트 점검이 공유한다(경고는 호출부가 맡는다).
function isProviderConfigured(provider: LlmProviderId): boolean {
  const env = getEnv();
  switch (provider) {
    case "openai":
      return Boolean(env.OPENAI_API_KEY);
    case "anthropic":
      return Boolean(env.ANTHROPIC_API_KEY);
    case "google":
      return Boolean(env.GEMINI_API_KEY ?? env.GEMINI_VERTEX_PROJECT);
  }
}

// forTask 핫패스 가드 — override가 못 쓸 상태면 무시하고 tier 기본(gpt-5)으로 폴백한다.
// Gemini/Anthropic 키 없는 환경에서 라우팅이 auth 에러로 터지지 않게 하는 안전장치(게이트웨이
// 일원화 전까지). 같은 모델은 1회만 경고하고, 키가 다시 채워지면 엔트리를 비워 다음 폴백을 또
// 알린다. 미등록 모델과 키 부재를 구분해 운영자가 없는 키를 헛되이 쫓지 않게 한다.
const unconfiguredOverrideWarned = new Set<string>();
function isOverrideProviderConfigured(modelId: string): boolean {
  const spec = getModelSpec(modelId);
  const configured = spec ? isProviderConfigured(spec.provider) : false;
  if (configured) {
    unconfiguredOverrideWarned.delete(modelId);
    return true;
  }
  if (!unconfiguredOverrideWarned.has(modelId)) {
    unconfiguredOverrideWarned.add(modelId);
    const reason = spec
      ? `missing ${spec.provider} provider key`
      : "unknown model (not in catalog)";
    console.warn(
      `[llm-router] task override "${modelId}" not usable (${reason}) — falling back to tier default`,
    );
  }
  return false;
}

// tier 묶음을 forTask가 달린 LlmRouter로 감싼다. forTask 해석:
//  - task override가 있으면 → 카탈로그 모델용 provider(모델별 캐시, 공유 클라이언트 재사용)
//  - 없으면 → 현재 tier(TASK_DEFAULTS). preset이 cached.llm의 tier를 갈아끼우므로
//    기본 경로는 활성 preset을 자동으로 따른다(= 동작 불변).
function toRouter(tiers: TieredLlm): LlmRouter {
  return {
    forTask(task: LlmTask): LlmProvider {
      const override = getTaskOverride(task);
      if (override && isOverrideProviderConfigured(override.modelId)) {
        return bindEffort(
          resolveOverrideProvider(override.modelId),
          override.effort,
        );
      }
      const def = TASK_DEFAULTS[task];
      // TASK_DEFAULTS는 as const라 effort 없는 task는 키 자체가 없다 — in으로 좁힌다.
      const effort = "effort" in def ? def.effort : undefined;
      return bindEffort(tiers[def.tier], effort);
    },
  };
}

// task 바인딩의 네이티브 effort를 호출 파라미터에 주입한다. 호출부가 직접 effort를
// 넘기면(주로 eval) 그 값을 존중하고, 없을 때만 바인딩 기본값을 채운다.
function bindEffort(
  provider: LlmProvider,
  effort: LlmEffort | undefined,
): LlmProvider {
  if (effort === undefined) {
    return provider;
  }
  return {
    generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
      return provider.generateStructured({ effort, ...params });
    },
    generateStream(params: GenerateStreamParams): AsyncIterable<string> {
      return provider.generateStream({ effort, ...params });
    },
    generateText(params: GenerateTextParams): Promise<string> {
      return provider.generateText({ effort, ...params });
    },
  };
}

function resolveOverrideProvider(modelId: string): LlmProvider {
  if (!overrideProviders) {
    throw new Error("Providers not initialized");
  }
  const cachedProvider = overrideProviders.get(modelId);
  if (cachedProvider) {
    return cachedProvider;
  }
  const provider = createProviderForModel(modelId, providerClients);
  overrideProviders.set(modelId, provider);
  return provider;
}

// openai 어댑터용 공유 클라이언트 — tier·override가 OpenAI 모델을 처음 쓸 때 만든다.
// getProviders가 부팅 시 OPENAI_API_KEY를 보장하므로 auth throw는 방어적(비프로덕션 폴백 tier 포함).
function getOpenAiClient(): OpenAI {
  if (sharedOpenAiClient) {
    return sharedOpenAiClient;
  }
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new LlmError(
      "auth",
      "OPENAI_API_KEY is required to use an OpenAI model",
    );
  }
  sharedOpenAiClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: OPENAI_DEFAULT_TIMEOUT_MS,
  });
  return sharedOpenAiClient;
}

function getAnthropicClient(): Anthropic {
  if (sharedAnthropicClient) {
    return sharedAnthropicClient;
  }
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new LlmError(
      "auth",
      "ANTHROPIC_API_KEY is required to use an Anthropic model",
    );
  }
  sharedAnthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return sharedAnthropicClient;
}

function getGeminiClient(): GoogleGenAI {
  if (sharedGeminiClient) {
    return sharedGeminiClient;
  }
  const env = getEnv();
  sharedGeminiClient = createGeminiClient({
    vertexProject: env.GEMINI_VERTEX_PROJECT,
    vertexLocation: env.GEMINI_VERTEX_LOCATION,
    vertexServiceAccountJson: env.GEMINI_VERTEX_SERVICE_ACCOUNT_JSON,
    apiKey: env.GEMINI_API_KEY,
  });
  return sharedGeminiClient;
}

// tier·override가 공유하는 클라이언트 게터 묶음. 매칭되는 프로바이더의 게터만 호출되므로
// 안 쓰는 프로바이더 키 부재로 조립이 터지지 않는다.
const providerClients: ProviderClients = {
  getOpenAiClient,
  getAnthropicClient,
  getGeminiClient,
};

// tier 모델 해석 + 부팅 보호. resolveTierModelIds가 prod lock·기본값을 정한 뒤,
// 비프로덕션에서 기본이 된 Google 모델의 키가 없으면 커밋된 OpenAI 기본값으로 폴백한다
// (OPENAI_API_KEY는 getProviders가 부팅 시 이미 보장). Google 키 없는 staging도 그대로 뜬다.
// 프로덕션은 desired가 OpenAI 기본값이라 폴백이 걸리지 않는다(하드 lock 그대로).
const unconfiguredTierWarned = new Set<string>();
function ensureConfiguredTierModel(modelId: string, fallback: string): string {
  const spec = getModelSpec(modelId);
  if (spec && isProviderConfigured(spec.provider)) {
    unconfiguredTierWarned.delete(modelId);
    return modelId;
  }
  if (!unconfiguredTierWarned.has(modelId)) {
    unconfiguredTierWarned.add(modelId);
    const reason = spec
      ? `missing ${spec.provider} provider key`
      : "unknown model (not in catalog)";
    // seed 배치를 걷어낸 뒤로 이 폴백이 유일한 비용-안전 신호다(비프로덕션 tier가 저렴한
    // Google을 못 잡고 gpt-5로 새는 경우). reportSeedIssue와 같은 급으로 Sentry까지 올린다.
    const message = `[llm-router] tier default "${modelId}" not usable (${reason}) — falling back to "${fallback}"`;
    console.warn(message);
    Sentry.captureMessage(message, { level: "warning" });
  }
  return fallback;
}

function resolveConfiguredTierModels(): TierModelIds {
  const env = getEnv();
  const desired = resolveTierModelIds({
    appEnv: env.APP_ENV,
    standard: env.LLM_MODEL_STANDARD,
    mini: env.LLM_MODEL_MINI,
    nano: env.LLM_MODEL_NANO,
  });
  return {
    standard: ensureConfiguredTierModel(
      desired.standard,
      DEFAULT_STANDARD_MODEL,
    ),
    mini: ensureConfiguredTierModel(desired.mini, DEFAULT_MINI_MODEL),
    nano: ensureConfiguredTierModel(desired.nano, DEFAULT_NANO_MODEL),
  };
}

// 배포 오설정이 "멀쩡해 보이게" 묻히지 않도록, seeded 기본 배치가 살아있는지 부팅 때 본다.
// 키 부재/미등록 모델 → forTask가 조용히 gpt-5 tier로 폴백하는데(비싼 모델·측정과 다름) Sentry로
// 알린다(index.ts 부트 오설정 패턴과 동일). 키가 있으면 eager resolve로 클라이언트 생성오류를 첫
// 요청이 아니라 부팅 때 잡는다(setTaskModel의 set-time 검증과 동등).
// 잔여 위험: 키가 있지만 무효(폐기·잘못된 project)면 여기선 못 거르고 override가 쓰여, 워커가
// resolve→throw→무한재처리에 빠질 수 있다 — 워커 하드타임아웃(NEM-168)으로 닫는다.
function reportSeedIssue(message: string): void {
  console.warn(`[llm-router] ${message}`);
  Sentry.captureMessage(`[llm-router] ${message}`, { level: "warning" });
}

function auditSeededOverrides(): void {
  for (const [task, modelId] of Object.entries(getAllTaskOverrides())) {
    if (!modelId) {
      continue;
    }
    const spec = getModelSpec(modelId);
    if (!spec) {
      reportSeedIssue(
        `task "${task}" seeds unknown model "${modelId}" — falling back to tier default`,
      );
      continue;
    }
    if (!isProviderConfigured(spec.provider)) {
      reportSeedIssue(
        `task "${task}" seeds ${spec.provider} model "${modelId}" but its key is missing — falling back to tier default`,
      );
      continue;
    }
    try {
      resolveOverrideProvider(modelId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      reportSeedIssue(
        `task "${task}" seed "${modelId}" failed to initialize (${detail}) — falling back to tier default`,
      );
    }
  }
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

  overrideProviders = new Map();

  const tierModels = resolveConfiguredTierModels();
  const tiers = createTieredLlm(tierModels, providerClients);

  cached = {
    llm: toRouter(tiers),
    embedding: createVoyageProvider({ apiKey: env.VOYAGE_API_KEY }),
    vectorStore: createQdrantStore(createQdrantClient()),
  };

  // prod 전용 잠금 — 프로덕션에서 모델 프리셋 교체가 열리면 비용·보안 사고로 이어진다
  if (env.APP_ENV !== "production") {
    originalTiers = tiers;
    resolvedModelNames = tierModels;
    applyLlmPreset("all-nano");
  }

  auditSeededOverrides();
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
  if (!cached || !originalTiers) {
    throw new Error("Providers not initialized");
  }
  applyLlmPreset(preset);
}

function applyLlmPreset(preset: LlmPreset): void {
  if (!cached || !originalTiers) {
    throw new Error("applyLlmPreset called before providers initialized");
  }
  currentPreset = preset;
  const tiers: TieredLlm =
    preset === "all-nano"
      ? {
          standard: originalTiers.nano,
          mini: originalTiers.nano,
          nano: originalTiers.nano,
        }
      : originalTiers;
  cached.llm = toRouter(tiers);
}

// task별 런타임 모델 스위칭 — preset과 같은 prod 잠금을 공유한다.
// 모델 id는 setTaskOverride가 MODEL_CATALOG로 검증한다.
export function setTaskModel(params: {
  task: LlmTask;
  modelId: string;
  effort?: LlmEffort;
}): void {
  const { task, modelId, effort } = params;
  const env = getEnv();
  if (env.APP_ENV === "production") {
    throw new Error("LLM task override is not available in production");
  }
  // resolveOverrideProvider가 의존하는 overrideProviders/공유 클라이언트는
  // getProviders가 cached보다 먼저 채우므로, cached 존재가 곧 초기화 완료를 보장한다.
  if (!cached) {
    throw new Error("Providers not initialized");
  }
  // set-time 검증: override를 커밋하기 전에 실제로 provider를 해석해 본다.
  // 카탈로그엔 있지만 어댑터 미배선/API 키 부재로 resolve 단계에서만 터지는 모델을
  // 여기서 걸러야 한다 — 안 그러면 워커가 배치마다 resolve→throw→pending 유지로
  // 무한 재처리(조용한 재시도 루프)에 빠진다. 성공적으로 set된 override는
  // resolve 가능함이 보장된다(해석된 provider는 캐시되어 그대로 재사용).
  try {
    resolveOverrideProvider(modelId);
  } catch (err) {
    if (err instanceof LlmError) {
      throw new LlmError(
        "bad_request",
        `Cannot set override for "${task}": model "${modelId}" is not usable — ${err.message}`,
        err,
      );
    }
    throw err;
  }
  setTaskOverride({ task, modelId, effort });
}
