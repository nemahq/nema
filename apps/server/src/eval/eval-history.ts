// 가성비 측정 이력(A) — 한 (모델 × 기능) 측정을 쿼리 가능한 행으로 박제한다.
// 공통 4컬럼(model·task·costUsd·latencyMs)은 실트래픽 원가(B)가 미러할 규약 —
// 같은 이름·단위로 둬 "예측(A) vs 실제(B)" 비교가 컬럼 정렬로 성립한다.
// 비용·지연·토큰은 동작당(=호출당) 평균으로 환산 — B가 동작당 실비용을 재므로 grain을 맞춘다.

import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@server/env";
import {
  computeCostUsd,
  type LlmProviderId,
} from "@server/infra/llm/model-catalog";
import type { LlmTask } from "@server/infra/llm/task-routing";

import type { MeteringTotals } from "./metering-provider";

export interface EvalRunRow {
  // --- 공통 (B가 미러) ---
  model: string;
  task: LlmTask;
  costUsd: number | null;
  latencyMs: number;
  // --- A 전용 ---
  runAt: string;
  provider: LlmProviderId;
  evalVersion: string;
  promptVersion: string;
  qualityScore: number | null;
  selfPreference: boolean;
  signals: Record<string, unknown>;
}

export function buildEvalRunRow(params: {
  model: string;
  provider: LlmProviderId;
  task: LlmTask;
  runAt: string;
  evalVersion: string;
  promptVersion: string;
  totals: MeteringTotals;
  qualityScore: number | null;
  selfPreference: boolean;
  signals?: Record<string, unknown>;
}): EvalRunRow {
  const { totals } = params;
  const calls = Math.max(totals.calls, 1);
  const totalCostUsd = computeCostUsd(params.model, {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
  });
  return {
    model: params.model,
    task: params.task,
    costUsd: totalCostUsd === null ? null : totalCostUsd / calls,
    latencyMs: Math.round(totals.totalLatencyMs / calls),
    runAt: params.runAt,
    provider: params.provider,
    evalVersion: params.evalVersion,
    promptVersion: params.promptVersion,
    qualityScore: params.qualityScore,
    selfPreference: params.selfPreference,
    signals: {
      calls: totals.calls,
      totalCostUsd,
      inputTokensPerCall: Math.round(totals.inputTokens / calls),
      outputTokensPerCall: Math.round(totals.outputTokens / calls),
      reasoningTokensPerCall: Math.round(totals.reasoningTokens / calls),
      ...params.signals,
    },
  };
}

interface EvalRunInsert {
  run_at: string;
  model: string;
  provider: string;
  task: string;
  eval_version: string;
  prompt_version: string;
  cost_usd: number | null;
  latency_ms: number;
  quality_score: number | null;
  self_preference: boolean;
  signals: Record<string, unknown>;
}

function toInsert(row: EvalRunRow): EvalRunInsert {
  return {
    run_at: row.runAt,
    model: row.model,
    provider: row.provider,
    task: row.task,
    eval_version: row.evalVersion,
    prompt_version: row.promptVersion,
    cost_usd: row.costUsd,
    latency_ms: row.latencyMs,
    quality_score: row.qualityScore,
    self_preference: row.selfPreference,
    signals: row.signals,
  };
}

// staging 적재(--persist). 기본 측정은 JSON만 — 스모크가 staging을 오염시키지 않게
// 오케스트레이터가 호출 여부를 가른다. 생성된 Database 타입엔 eval_runs가 아직 없어
// (마이그레이션 staging 반영 후 타입 재생성은 후속), 적재 형태만 EvalRunInsert로 고정하고
// 클라이언트는 스키마 미지정으로 둔다.
export async function persistEvalRuns(rows: EvalRunRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const payload: EvalRunInsert[] = rows.map(toInsert);
  const { error } = await client.from("eval_runs").insert(payload);
  if (error) {
    throw new Error(`eval_runs insert failed: ${error.message}`);
  }
}
