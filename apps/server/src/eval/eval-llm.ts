import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { createLlmProviderFromEnv } from "@server/infra/llm/model-factory";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";

// EVAL_LLM_MODEL로 측정 대상 LLM을 갈아끼운다 — 미설정이면 prod 기본(gpt-5 standard)과 동일.
// Gemini 모델 id를 주면 GEMINI_VERTEX_PROJECT(있으면 Vertex)/GEMINI_API_KEY로 자동 라우팅돼,
// 무료 크레딧으로 엔진 측정을 돌릴 수 있다. 모델 종속 노브(effort/timeout/임계)는 호출부가 따로 잡는다.
export function resolveEvalModelId(
  fallback: string = DEFAULT_STANDARD_MODEL,
): string {
  return process.env["EVAL_LLM_MODEL"]?.trim() || fallback;
}

export function createEvalLlm(fallback?: string): LlmProvider {
  return createLlmProviderFromEnv(resolveEvalModelId(fallback));
}
