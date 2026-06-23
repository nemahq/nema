// task별 모델 라우팅 — 5개 LLM 기능마다 독립적으로 모델을 갈아끼우는 층.
// 기본값은 각 task가 현재 쓰는 tier를 그대로 가리켜(아래 TASK_DEFAULTS),
// override가 없으면 동작이 불변이다. override는 메모리 전용(재배포 없이 런타임 스위칭).
import { z } from "zod";

import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmEffort, OpenAiEffort } from "@server/infra/llm/llm-provider";
import {
  getModelSpec,
  isEffortValidFor,
} from "@server/infra/llm/model-catalog";

// task 목록 단일 출처 — dev-router의 런타임 입력 검증도 이 enum을 공유한다.
// 나눠 적으면 새 task를 한쪽만 추가했을 때 런타임 검증이 조용히 어긋난다.
// 값 규칙: <동사><목적어> — LLM이 수행하는 동작 + 도메인 객체. 값만 봐도 무엇을 하는지 읽히게 한다.
export const LLM_TASK_SCHEMA = z.enum([
  "generateDraft",
  "classifyDraftIntent",
  "generateSessionTitle",
  "extractStatements",
  "judgeRelations",
  "assistDraft",
  "narrate",
  "structureQuery",
]);

export type LlmTask = z.infer<typeof LLM_TASK_SCHEMA>;

type Tier = "standard" | "mini" | "nano";

interface TaskDefault {
  tier: Tier;
  // 기본 경로는 OpenAI tier라 effort도 OpenAI 어휘. 미지정이면 effort 없이 호출(동작 불변).
  effort?: OpenAiEffort;
}

// 각 task의 기본 tier·effort — 5개 호출부가 현재 쓰는 설정을 그대로 미러한다.
// 이 표가 곧 "override 없을 때의 동작 불변" 계약이다.
export const TASK_DEFAULTS = {
  generateDraft: { tier: "standard" },
  classifyDraftIntent: { tier: "mini" },
  generateSessionTitle: { tier: "nano" },
  extractStatements: { tier: "standard", effort: "low" },
  judgeRelations: { tier: "standard", effort: "low" },
  // 한 방 어시스턴트: 말뭉치를 깎아 본문 + 제목 + 주제 제안(구조화 출력). 정제 작업이라 standard.
  assistDraft: { tier: "standard" },
  // 해설: 근거 묶음을 산문으로 풀어 읽는다. 품질이 신뢰의 핵심이라 standard.
  narrate: { tier: "standard" },
  // 질의 구조화: 검색어를 의미부 + 시간 토큰으로 가른다. 검색 경로라 싸고 빨라야 해 mini.
  structureQuery: { tier: "mini" },
} as const satisfies Record<LlmTask, TaskDefault>;

// task → override. effort는 그 모델 프로바이더의 네이티브 값(set 시점에 검증).
export interface TaskOverride {
  modelId: string;
  effort?: LlmEffort;
}

const taskOverrides = new Map<LlmTask, TaskOverride>();

export function getTaskOverride(task: LlmTask): TaskOverride | undefined {
  return taskOverrides.get(task);
}

export function setTaskOverride(params: {
  task: LlmTask;
  modelId: string;
  effort?: LlmEffort;
}): void {
  const { task, modelId, effort } = params;
  const spec = getModelSpec(modelId);
  if (!spec) {
    throw new LlmError(
      "bad_request",
      `Unknown model id "${modelId}" — not registered in MODEL_CATALOG`,
    );
  }
  // effort는 모델 프로바이더가 받는 값이어야 한다 — 안 먹는 값을 set 시점에 거른다.
  if (effort !== undefined && !isEffortValidFor(spec.provider, effort)) {
    throw new LlmError(
      "bad_request",
      `Effort "${effort}" is not valid for ${spec.provider} model "${modelId}"`,
    );
  }
  taskOverrides.set(task, { modelId, effort });
}

export function clearTaskOverride(task: LlmTask): void {
  taskOverrides.delete(task);
}

export function getAllTaskOverrides(): Record<LlmTask, string | null> {
  // task 목록을 TASK_DEFAULTS에서 파생 — 6번째 task가 생겨도 누락되지 않는다.
  const tasks = Object.keys(TASK_DEFAULTS) as LlmTask[];
  return Object.fromEntries(
    tasks.map((task) => [task, taskOverrides.get(task)?.modelId ?? null]),
  ) as Record<LlmTask, string | null>;
}
