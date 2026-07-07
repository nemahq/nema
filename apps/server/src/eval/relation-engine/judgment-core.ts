// 관계 판정 채점의 공유 코어 — 한 시나리오 1회 판정(워커와 동일한 LLM 1콜 + 같은 게이트).
// run-judgment.ts(baseline)와 run-judgment-degraded.ts(민감도)가 함께 쓴다.
// run-judgment는 import 시 main()이 실행돼 직접 못 빌려오므로 여기로 뺐다.

import { createLimiter } from "@server/infra/llm/limiter";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  gateProposals,
  LINKING_EFFORT,
  LINKING_TIMEOUT_MS,
} from "@server/infra/statement-sync/worker";
import type {
  LabeledStatement,
  RelationProposal,
} from "@server/prompts/relation-judgment";
import {
  buildRelationJudgmentMessage,
  RELATION_JUDGMENT_SYSTEM_PROMPT,
  RelationJudgmentSchema,
} from "@server/prompts/relation-judgment";

import {
  type DuplicatePair,
  type DuplicateScore,
  type GatedRelation,
  scoreDuplicates,
  scorePredictions,
  type ScoreResult,
} from "./metrics";
import type { RelationScenario } from "./seed-data";

// gpt-5는 동시 4 초과 시 제공자 타임아웃이 관찰된다(measurement-log #3, run-extraction과 동일).
const JUDGMENT_CONCURRENCY = 4;
const JUDGMENT_MAX_ATTEMPTS = 3;
const JUDGMENT_RETRY_DELAY_MS = 3_000;

const limitJudgment = createLimiter(JUDGMENT_CONCURRENCY);

async function judge(
  llm: LlmProvider,
  message: string,
): Promise<{ relations: RelationProposal[] }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < JUDGMENT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const output = await limitJudgment(() =>
        llm.generateStructured({
          schema: RelationJudgmentSchema,
          schemaName: "relation_judgment",
          systemPrompt: RELATION_JUDGMENT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: message }],
          // 제품(worker ③단계)과 동일 설정 — 평가가 같은 경로를 본다
          effort: LINKING_EFFORT,
          timeoutMs: LINKING_TIMEOUT_MS,
          maxRetries: 0,
        }),
      );
      return { relations: output.relations };
    } catch (error) {
      lastError = error;
      console.warn(
        `  판정 재시도 ${attempt + 1}/${JUDGMENT_MAX_ATTEMPTS}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await new Promise((r) =>
        setTimeout(r, JUDGMENT_RETRY_DELAY_MS * (attempt + 1)),
      );
    }
  }
  throw lastError;
}

// 워커 linkSubBatch와 동일한 라벨 부여 — 새 진술 N{i}, 기존 후보 E{i}. LLM엔 라벨만
// 보여 uuid 환각을 막고, 판정 후 라벨→id로 되돌린다. id = 시나리오 진술 id.
function buildLabels(scenario: RelationScenario): {
  newLabeled: LabeledStatement[];
  existingLabeled: LabeledStatement[];
  labelToId: Map<string, string>;
  batchIds: Set<string>;
} {
  const labelToId = new Map<string, string>();
  const toLabeled = (
    statement: RelationScenario["statements"][number],
    label: string,
  ): LabeledStatement => {
    labelToId.set(label, statement.id);
    return {
      label,
      content: statement.content,
      type: statement.type,
      confidence: statement.type === "claim" ? statement.confidence : null,
    };
  };

  const newStatements = scenario.statements.filter((s) => s.role === "new");
  const existingStatements = scenario.statements.filter(
    (s) => s.role === "existing",
  );
  const newLabeled = newStatements.map((s, i) => toLabeled(s, `N${i}`));
  const existingLabeled = existingStatements.map((s, i) =>
    toLabeled(s, `E${i}`),
  );

  return {
    newLabeled,
    existingLabeled,
    labelToId,
    batchIds: new Set(newStatements.map((s) => s.id)),
  };
}

// 한 시나리오 1회 판정 → 게이트 통과분(applied/pending)을 시나리오 id로 되돌려 채점.
export async function runScenarioOnce(params: {
  llm: LlmProvider;
  scenario: RelationScenario;
}): Promise<{ relation: ScoreResult; duplicate: DuplicateScore }> {
  const { llm, scenario } = params;
  const { newLabeled, existingLabeled, labelToId, batchIds } =
    buildLabels(scenario);

  const message = buildRelationJudgmentMessage(newLabeled, existingLabeled);
  const { relations } = await judge(llm, message);

  // 워커와 같은 게이트를 그대로 통과시킨다 — applied/pending 분기가 제품과 동일.
  // 같음(duplicates)도 relations에 섞여 오므로 게이트 후 type으로 갈라 각자 채점한다.
  const { applied, pending } = gateProposals({
    proposals: relations,
    labelToId,
    batchIds,
  });
  const gated: GatedRelation[] = [
    ...applied.map((c) => ({
      from: c.from_id,
      to: c.to_id,
      type: c.type,
      gate: "applied" as const,
    })),
    ...pending.map((c) => ({
      from: c.from_id,
      to: c.to_id,
      type: c.type,
      gate: "pending" as const,
    })),
  ];
  const predictions = gated.filter((p) => p.type !== "duplicates");
  const relation = scorePredictions({ predictions, golden: scenario.golden });

  // 중복: 게이트 통과분 중 type='duplicates'만. 방향은 from=keeper/to=duplicate이나
  // 채점 키가 정렬(방향 무시)이라 끝점 쌍만 넘긴다. 끝점은 시나리오 진술 id.
  const predictedDuplicates: DuplicatePair[] = gated
    .filter((p) => p.type === "duplicates")
    .map((p) => ({ a: p.from, b: p.to }));
  const expectedDuplicates: DuplicatePair[] = (
    scenario.expectedDuplicates ?? []
  ).map((d) => ({ a: d.duplicate, b: d.of }));
  const duplicate = scoreDuplicates({
    predicted: predictedDuplicates,
    expected: expectedDuplicates,
  });

  return { relation, duplicate };
}
