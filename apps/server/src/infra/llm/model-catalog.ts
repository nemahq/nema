// 모델 레지스트리 — task 라우팅이 override 모델 id를 검증·해석하는 단일 출처이자
// 가성비 측정(NEM-149)의 토큰 단가 출처. 단가는 변하므로 pricedAt·source로 박제한다.
import type { LlmEffort, LlmUsage } from "@server/infra/llm/llm-provider";
import {
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
} from "@server/infra/llm/models";

export type LlmProviderId = "openai" | "anthropic" | "google";

// 프로바이더별로 실제 받는 effort 값. override를 set할 때 모델 프로바이더에 맞는
// 값인지 여기서 검증해, 안 먹는 값(예: OpenAI에 xhigh)을 set 시점에 거른다.
const PROVIDER_EFFORTS: Record<LlmProviderId, ReadonlySet<LlmEffort>> = {
  openai: new Set<LlmEffort>(["minimal", "low", "medium", "high"]),
  anthropic: new Set<LlmEffort>(["low", "medium", "high", "xhigh", "max"]),
  google: new Set<LlmEffort>(["minimal", "low", "medium", "high"]),
};

export function isEffortValidFor(
  provider: LlmProviderId,
  effort: LlmEffort,
): boolean {
  return PROVIDER_EFFORTS[provider].has(effort);
}

// 토큰 단가 — USD per 1M tokens(청구 기준 입력/출력). 캐시·배치 할인은 v1 제외.
// pricedAt·source는 측정 결과를 "그때 단가" 기준으로 추적되게 박는 도장이다.
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  pricedAt: string;
  source: string;
}

export interface ModelSpec {
  id: string;
  provider: LlmProviderId;
  contextWindow?: number;
  // 미검증 모델은 생략 — computeCostUsd가 null을 돌려 비교가 "단가 없음"으로 표시한다.
  pricing?: ModelPricing;
}

// 카탈로그 항목에서 id를 뺀 형태 — id는 키에서 파생하므로 키/id 불일치가 구조적으로 불가능하다.
type ModelEntry = Omit<ModelSpec, "id">;

// gpt-5 계열 컨텍스트 윈도우 — 입력+출력 합산 상한(토큰).
const GPT5_CONTEXT_WINDOW = 400_000;

// Claude 계열 컨텍스트 윈도우(토큰).
const CLAUDE_CONTEXT_WINDOW = 200_000;

// Gemini 2.x 계열 컨텍스트 윈도우(토큰). 2.5 Pro는 1M+이나 보수적으로 1M로 잡는다.
const GEMINI_CONTEXT_WINDOW = 1_000_000;

// 9종 단가를 같은 날 공식 페이지에서 박제(NEM-149 측정 1차). 단가 갱신 시 이 날짜와 값을 함께 올린다.
const PRICED_AT = "2026-06-24";
const OPENAI_PRICING_SOURCE = "https://openai.com/api/pricing/";
const ANTHROPIC_PRICING_SOURCE =
  "https://platform.claude.com/docs/en/about-claude/pricing";
const GEMINI_PRICING_SOURCE = "https://ai.google.dev/gemini-api/docs/pricing";

// 알려진 모델 집합. env로 모델 id가 덮였다면(LLM_MODEL_*) 그 id는 여기 없을 수 있고,
// getModelSpec은 undefined를 돌려준다 — 라우팅 기본 경로(TASK_DEFAULTS→tier)는
// 카탈로그를 거치지 않으므로 env override가 있어도 기본 동작은 깨지지 않는다.
// 카탈로그는 "런타임에 명시적으로 갈아끼울 수 있는" 모델의 화이트리스트다.
export const MODEL_CATALOG: Record<string, ModelEntry> = {
  [DEFAULT_STANDARD_MODEL]: {
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 1.25,
      outputPerMTok: 10.0,
      pricedAt: PRICED_AT,
      source: OPENAI_PRICING_SOURCE,
    },
  },
  [DEFAULT_MINI_MODEL]: {
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 0.25,
      outputPerMTok: 2.0,
      pricedAt: PRICED_AT,
      source: OPENAI_PRICING_SOURCE,
    },
  },
  [DEFAULT_NANO_MODEL]: {
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 0.05,
      outputPerMTok: 0.4,
      pricedAt: PRICED_AT,
      source: OPENAI_PRICING_SOURCE,
    },
  },
  "claude-opus-4-8": {
    provider: "anthropic",
    contextWindow: CLAUDE_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 5.0,
      outputPerMTok: 25.0,
      pricedAt: PRICED_AT,
      source: ANTHROPIC_PRICING_SOURCE,
    },
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    contextWindow: CLAUDE_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 3.0,
      outputPerMTok: 15.0,
      pricedAt: PRICED_AT,
      source: ANTHROPIC_PRICING_SOURCE,
    },
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic",
    contextWindow: CLAUDE_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 1.0,
      outputPerMTok: 5.0,
      pricedAt: PRICED_AT,
      source: ANTHROPIC_PRICING_SOURCE,
    },
  },
  // 현행 Gemini 3.x — 만료된 2.5/2.0 대체.
  // Pro는 >200K 컨텍스트에서 $4/$18로 오르나, eval 입력은 작아 base tier($2/$12)로 박는다.
  "gemini-3.1-pro-preview": {
    provider: "google",
    contextWindow: GEMINI_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 2.0,
      outputPerMTok: 12.0,
      pricedAt: PRICED_AT,
      source: GEMINI_PRICING_SOURCE,
    },
  },
  "gemini-3.5-flash": {
    provider: "google",
    contextWindow: GEMINI_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 1.5,
      outputPerMTok: 9.0,
      pricedAt: PRICED_AT,
      source: GEMINI_PRICING_SOURCE,
    },
  },
  "gemini-3.1-flash-lite": {
    provider: "google",
    contextWindow: GEMINI_CONTEXT_WINDOW,
    pricing: {
      inputPerMTok: 0.25,
      outputPerMTok: 1.5,
      pricedAt: PRICED_AT,
      source: GEMINI_PRICING_SOURCE,
    },
  },
};

export function getModelSpec(id: string): ModelSpec | undefined {
  const entry = MODEL_CATALOG[id];
  if (!entry) {
    return undefined;
  }
  return { id, ...entry };
}

// 카탈로그 전체를 id 포함 ModelSpec 목록으로 — 노출부(dev-router)가 id를 잃지 않게.
export function listModelSpecs(): ModelSpec[] {
  return Object.entries(MODEL_CATALOG).map(([id, entry]) => ({ id, ...entry }));
}

const TOKENS_PER_MILLION = 1_000_000;

// 단가 × usage로 USD 비용. 모델이 카탈로그에 없거나 단가 미박제면 null —
// 호출부(비교 하니스)가 "단가 없음"으로 표시해 가짜 0원이 비교를 오염시키지 않게 한다.
export function computeCostUsd(
  modelId: string,
  usage: LlmUsage,
): number | null {
  const pricing = getModelSpec(modelId)?.pricing;
  if (!pricing) {
    return null;
  }
  return (
    (usage.inputTokens * pricing.inputPerMTok +
      usage.outputTokens * pricing.outputPerMTok) /
    TOKENS_PER_MILLION
  );
}
