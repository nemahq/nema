// 가성비 측정 이력(A) — 한 (모델 × 기능) 측정을 쿼리 가능한 행으로 박제한다.
// 공통 4컬럼(model·task·costUsd·latencyMs)은 실트래픽 원가(B)가 미러할 규약 —
// 같은 이름·단위로 둬 "예측(A) vs 실제(B)" 비교가 컬럼 정렬로 성립한다.
// 비용·지연·토큰은 동작당(=호출당) 평균으로 환산 — B가 동작당 실비용을 재므로 grain을 맞춘다.

import type { Json } from "@server/infra/database.types";
import {
  computeCostUsd,
  type LlmProviderId,
} from "@server/infra/llm/model-catalog";
import type { LlmTask } from "@server/infra/llm/task-routing";
import { getSupabaseAdmin } from "@server/infra/supabase";

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
  // 콜이 아예 없거나(아무것도 안 잼) usage 없는 콜이 섞이면 토큰 합을 신뢰할 수 없다 —
  // 가짜 $0 대신 비용을 null로 둔다.
  const totalCostUsd =
    totals.calls === 0 || totals.callsMissingUsage > 0
      ? null
      : computeCostUsd(params.model, {
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
      ...(totals.callsMissingUsage > 0
        ? { usageMissing: totals.callsMissingUsage }
        : {}),
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
  signals: Json;
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
    // signals는 측정 지표(수·문자열) 묶음이라 런타임은 항상 JSON 직렬화 가능 —
    // unknown 값 백을 jsonb 컬럼(Json)으로 좁히는 경계 캐스트.
    signals: row.signals as Json,
  };
}

// staging 적재(--persist). 기본 측정은 JSON만 — 스모크가 staging을 오염시키지 않게
// 오케스트레이터가 호출 여부를 가른다. service-role admin 클라이언트로 RLS를 우회해 적재한다.
export async function persistEvalRuns(rows: EvalRunRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const payload: EvalRunInsert[] = rows.map(toInsert);
  const { error } = await getSupabaseAdmin().from("eval_runs").insert(payload);
  if (error) {
    throw new Error(`eval_runs insert failed: ${error.message}`);
  }
}
