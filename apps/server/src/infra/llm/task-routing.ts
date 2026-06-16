// task별 모델 라우팅 — 5개 LLM 기능마다 독립적으로 모델을 갈아끼우는 층.
// 기본값은 각 task가 현재 쓰는 tier를 그대로 가리켜(아래 TASK_DEFAULT_TIER),
// override가 없으면 동작이 불변이다. override는 메모리 전용(재배포 없이 런타임 스위칭).
import { z } from "zod";

import { LlmError } from "@server/infra/llm/llm-error";
import { getModelSpec } from "@server/infra/llm/model-catalog";

// task 목록 단일 출처 — dev-router의 런타임 입력 검증도 이 enum을 공유한다.
// 나눠 적으면 새 task를 한쪽만 추가했을 때 런타임 검증이 조용히 어긋난다.
// 값 규칙: <동사><목적어> — LLM이 수행하는 동작 + 도메인 객체. 값만 봐도 무엇을 하는지 읽히게 한다.
export const LLM_TASK_SCHEMA = z.enum([
  "generateDraft",
  "classifyDraftIntent",
  "generateSessionTitle",
  "extractStatements",
  "judgeRelations",
]);

export type LlmTask = z.infer<typeof LLM_TASK_SCHEMA>;

// 각 task의 기본 tier — 5개 호출부가 현재 쓰는 tier를 그대로 미러한다.
// (drafting stream=standard, draft intent=mini, session title=nano,
//  추출=standard, 관계 판정=standard). 이 표가 곧 "override 없을 때의 동작 불변" 계약이다.
export const TASK_DEFAULT_TIER: Record<LlmTask, "standard" | "mini" | "nano"> =
  {
    generateDraft: "standard",
    classifyDraftIntent: "mini",
    generateSessionTitle: "nano",
    extractStatements: "standard",
    judgeRelations: "standard",
  };

// task → override 모델 id. 비어 있으면 기본 tier로 해석한다.
const taskOverrides = new Map<LlmTask, string>();

export function getTaskOverride(task: LlmTask): string | undefined {
  return taskOverrides.get(task);
}

export function setTaskOverride(task: LlmTask, modelId: string): void {
  if (!getModelSpec(modelId)) {
    throw new LlmError(
      "bad_request",
      `Unknown model id "${modelId}" — not registered in MODEL_CATALOG`,
    );
  }
  taskOverrides.set(task, modelId);
}

export function clearTaskOverride(task: LlmTask): void {
  taskOverrides.delete(task);
}

export function getAllTaskOverrides(): Record<LlmTask, string | null> {
  // task 목록을 TASK_DEFAULT_TIER에서 파생 — 6번째 task가 생겨도 누락되지 않는다.
  const tasks = Object.keys(TASK_DEFAULT_TIER) as LlmTask[];
  return Object.fromEntries(
    tasks.map((task) => [task, taskOverrides.get(task) ?? null]),
  ) as Record<LlmTask, string | null>;
}
