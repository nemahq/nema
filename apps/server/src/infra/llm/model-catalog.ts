// 모델 레지스트리 — task 라우팅이 override 모델 id를 검증·해석하는 단일 출처.
// 단가·세부 능력은 후속 측정 단계로 미룬다.
import type { LlmEffort } from "@server/infra/llm/llm-provider";
import {
  DEFAULT_MINI_MODEL,
  DEFAULT_NANO_MODEL,
  DEFAULT_STANDARD_MODEL,
} from "@server/infra/llm/models";

export type LlmProviderId = "openai" | "anthropic" | "google";

// 프로바이더별로 실제 받는 effort 값. override를 set할 때 모델 프로바이더에 맞는
// 값인지 여기서 검증해, 안 먹는 값(예: OpenAI에 xhigh)을 set 시점에 거른다.
// TODO: 검증이 프로바이더 단위라 모델별 차이는 못 잡는다 — Anthropic xhigh는 Opus 전용,
// max는 Haiku 미지원. 잘못된 조합은 set-time 통과 후 call-time LlmError로 드러난다(dev 전용,
// prod 잠금). 모델별 유효 effort 표가 필요해지면 그때 좁힌다.
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

export interface ModelSpec {
  id: string;
  provider: LlmProviderId;
  contextWindow?: number;
}

// 카탈로그 항목에서 id를 뺀 형태 — id는 키에서 파생하므로 키/id 불일치가 구조적으로 불가능하다.
type ModelEntry = Omit<ModelSpec, "id">;

// gpt-5 계열 컨텍스트 윈도우 — 입력+출력 합산 상한(토큰).
const GPT5_CONTEXT_WINDOW = 400_000;

// Claude 계열 컨텍스트 윈도우(토큰).
const CLAUDE_CONTEXT_WINDOW = 200_000;

// Gemini 2.x 계열 컨텍스트 윈도우(토큰). 2.5 Pro는 1M+이나 보수적으로 1M로 잡는다.
const GEMINI_CONTEXT_WINDOW = 1_000_000;

// 알려진 모델 집합. env로 모델 id가 덮였다면(LLM_MODEL_*) 그 id는 여기 없을 수 있고,
// getModelSpec은 undefined를 돌려준다 — 라우팅 기본 경로(TASK_DEFAULTS→tier)는
// 카탈로그를 거치지 않으므로 env override가 있어도 기본 동작은 깨지지 않는다.
// 카탈로그는 "런타임에 명시적으로 갈아끼울 수 있는" 모델의 화이트리스트다.
export const MODEL_CATALOG: Record<string, ModelEntry> = {
  [DEFAULT_STANDARD_MODEL]: {
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
  },
  [DEFAULT_MINI_MODEL]: {
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
  },
  [DEFAULT_NANO_MODEL]: {
    provider: "openai",
    contextWindow: GPT5_CONTEXT_WINDOW,
  },
  "claude-opus-4-8": {
    provider: "anthropic",
    contextWindow: CLAUDE_CONTEXT_WINDOW,
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    contextWindow: CLAUDE_CONTEXT_WINDOW,
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic",
    contextWindow: CLAUDE_CONTEXT_WINDOW,
  },
  // 현행 Gemini 3.x — 만료된 2.5/2.0 대체.
  "gemini-3.1-pro-preview": {
    provider: "google",
    contextWindow: GEMINI_CONTEXT_WINDOW,
  },
  "gemini-3.5-flash": {
    provider: "google",
    contextWindow: GEMINI_CONTEXT_WINDOW,
  },
  "gemini-3.1-flash-lite": {
    provider: "google",
    contextWindow: GEMINI_CONTEXT_WINDOW,
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
