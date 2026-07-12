import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

import { AnthropicProvider } from "@server/infra/llm/anthropic-provider";
import {
  DEFAULT_TIMEOUT_MS as GEMINI_DEFAULT_TIMEOUT_MS,
  GeminiProvider,
} from "@server/infra/llm/gemini-provider";
import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { getModelSpec } from "@server/infra/llm/model-catalog";
import type { TieredLlm, TierModelIds } from "@server/infra/llm/models";
import {
  DEFAULT_TIMEOUT_MS as OPENAI_DEFAULT_TIMEOUT_MS,
  OpenAiProvider,
} from "@server/infra/llm/openai-provider";

const VERTEX_DEFAULT_LOCATION = "global";

// Gemini 클라이언트 생성 — vertexProject가 있으면 Vertex(ADC 인증·GCP 크레딧),
// 없으면 AI Studio(apiKey). 두 경로의 단일 진입점이라 providers(요청 경로)와
// eval 스크립트가 같은 규칙으로 Vertex를 켠다.
export function createGeminiClient(opts: {
  vertexProject?: string;
  vertexLocation?: string;
  apiKey?: string;
}): GoogleGenAI {
  if (opts.vertexProject) {
    return new GoogleGenAI({
      vertexai: true,
      project: opts.vertexProject,
      location: opts.vertexLocation ?? VERTEX_DEFAULT_LOCATION,
      httpOptions: { timeout: GEMINI_DEFAULT_TIMEOUT_MS },
    });
  }
  if (!opts.apiKey) {
    throw new LlmError(
      "auth",
      "GEMINI_API_KEY or GEMINI_VERTEX_PROJECT is required to use a Google model",
    );
  }
  return new GoogleGenAI({
    apiKey: opts.apiKey,
    httpOptions: { timeout: GEMINI_DEFAULT_TIMEOUT_MS },
  });
}

// 클라이언트는 lazy getter로 받는다 — 매칭되는 프로바이더의 키만 요구하고,
// 안 쓰는 프로바이더 키 부재로 터지지 않게 한다.
export interface ProviderClients {
  getOpenAiClient: () => OpenAI;
  getAnthropicClient: () => Anthropic;
  getGeminiClient: () => GoogleGenAI;
}

// modelId(MODEL_CATALOG) → 해당 프로바이더 어댑터. 모델 선택을 OpenAI 하드코딩에서
// 떼어내, 요청 경로(providers)와 eval이 모델 id만으로 멀티 프로바이더를 쓰게 한다.
export function createProviderForModel(
  modelId: string,
  clients: ProviderClients,
): LlmProvider {
  const spec = getModelSpec(modelId);
  if (!spec) {
    throw new LlmError(
      "bad_request",
      `Unknown model id "${modelId}" — not in MODEL_CATALOG`,
    );
  }

  switch (spec.provider) {
    case "openai":
      return new OpenAiProvider({
        client: clients.getOpenAiClient(),
        model: spec.id,
      });
    case "anthropic":
      return new AnthropicProvider({
        client: clients.getAnthropicClient(),
        model: spec.id,
      });
    case "google":
      return new GeminiProvider({
        client: clients.getGeminiClient(),
        model: spec.id,
      });
    default: {
      const exhaustive: never = spec.provider;
      throw new LlmError(
        "bad_request",
        `No adapter wired for provider "${String(exhaustive)}" (model "${modelId}")`,
      );
    }
  }
}

// 세 tier를 카탈로그 기반 멀티 프로바이더로 조립한다 — override 경로와 같은
// createProviderForModel을 써서 tier도 어느 프로바이더 모델이든 가리킬 수 있다.
// 모델 id 해석(prod lock·기본값·키 부재 폴백)은 호출부가 끝내고 확정된 id만 넘긴다.
export function createTieredLlm(
  models: TierModelIds,
  clients: ProviderClients,
): TieredLlm {
  return {
    standard: createProviderForModel(models.standard, clients),
    mini: createProviderForModel(models.mini, clients),
    nano: createProviderForModel(models.nano, clients),
  };
}

// 스탠드얼론 스크립트(eval)용 — getProviders 싱글턴(QDRANT 등 전부 요구)을 거치지 않고
// process.env에서 필요한 키만 읽어 모델 provider를 만든다. Gemini는 createGeminiClient로
// Vertex/AI Studio를 자동 선택한다.
export function createLlmProviderFromEnv(modelId: string): LlmProvider {
  return createProviderForModel(modelId, {
    getOpenAiClient: () => {
      const apiKey = process.env["OPENAI_API_KEY"]?.trim();
      if (!apiKey) {
        throw new LlmError("auth", "OPENAI_API_KEY is required");
      }
      return new OpenAI({ apiKey, timeout: OPENAI_DEFAULT_TIMEOUT_MS });
    },
    getAnthropicClient: () => {
      const apiKey = process.env["ANTHROPIC_API_KEY"]?.trim();
      if (!apiKey) {
        throw new LlmError("auth", "ANTHROPIC_API_KEY is required");
      }
      return new Anthropic({ apiKey });
    },
    getGeminiClient: () =>
      createGeminiClient({
        vertexProject: process.env["GEMINI_VERTEX_PROJECT"]?.trim(),
        vertexLocation: process.env["GEMINI_VERTEX_LOCATION"]?.trim(),
        apiKey: process.env["GEMINI_API_KEY"]?.trim(),
      }),
  });
}
