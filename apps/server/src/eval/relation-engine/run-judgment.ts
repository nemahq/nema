// 관계 판정 러너 (relation-design §5) — eval/statement-engine 패턴 미러
//
// 실행: apps/server에서  pnpm tsx src/eval/relation-engine/run-judgment.ts
//   --quick  : 시나리오당 1회만 (반복 안정화 생략 — 프롬프트 보정 빠른 루프)
//   --runs N : 시나리오당 N회 (전후 비교를 촘촘히 — 드문 FP를 안정적으로 잡기)
// 필요 키: OPENAI_API_KEY (판정 LLM). 채점은 코드 정확 비교라 심판 LLM 없음.
//
// 흐름: 시나리오 N개 × R회 판정(워커와 동일한 LLM 1콜 + 같은 게이트) →
//   게이트 통과분(applied/pending)을 골든과 대조 → supports FP·게이트 통과 FP 집계.
// 결과는 results-judgment-*.json — 집계 숫자 + 실패 사례 전수(eval-design 결정 #7).

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마(필수 키·쌍 제약) 통과용 자리값.
// (run-extraction과 같은 자리값 정책 — 커밋된 .env에 숨어 기대지 않게 쌍으로 박는다.)
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createLimiter } from "@server/infra/llm/limiter";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  gateProposals,
  LINKING_REASONING_EFFORT,
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
  appliedFalsePositives,
  type GatedRelation,
  precisionRecall,
  round,
  scorePredictions,
  type ScoreResult,
  tallyByType,
} from "./metrics";
import { RELATION_SCENARIOS, type RelationScenario } from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

// LLM이 매번 답이 조금씩 달라, 기본은 3회로 run 노이즈를 줄인다.
// --quick: 1회(빠른 보정 루프). --runs N: 전후 비교를 더 촘촘히(드문 FP를 안정적으로 잡기).
const DEFAULT_RUNS_PER_SCENARIO = 3;
function parseRunsArg(): number {
  if (process.argv.includes("--quick")) {
    return 1;
  }
  const flagIndex = process.argv.indexOf("--runs");
  if (flagIndex !== -1) {
    const parsed = Number(process.argv[flagIndex + 1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    console.error("--runs requires a positive integer");
    process.exit(1);
  }
  return DEFAULT_RUNS_PER_SCENARIO;
}
const RUNS_PER_SCENARIO = parseRunsArg();
// gpt-5는 동시 4 초과 시 제공자 타임아웃이 관찰된다(measurement-log #3, run-extraction과 동일).
const JUDGMENT_CONCURRENCY = 4;
const JUDGMENT_MAX_ATTEMPTS = 3;
const JUDGMENT_RETRY_DELAY_MS = 3_000;
const PROMPT_HASH_LENGTH = 8;

const limitJudgment = createLimiter(JUDGMENT_CONCURRENCY);

async function judge(
  llm: LlmProvider,
  message: string,
): Promise<RelationProposal[]> {
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
          reasoningEffort: LINKING_REASONING_EFFORT,
          timeoutMs: LINKING_TIMEOUT_MS,
          maxRetries: 0,
        }),
      );
      return output.relations;
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
async function runScenarioOnce(params: {
  llm: LlmProvider;
  scenario: RelationScenario;
}): Promise<ScoreResult> {
  const { llm, scenario } = params;
  const { newLabeled, existingLabeled, labelToId, batchIds } =
    buildLabels(scenario);

  const message = buildRelationJudgmentMessage(newLabeled, existingLabeled);
  const proposals = await judge(llm, message);

  // 워커와 같은 게이트를 그대로 통과시킨다 — applied/pending 분기가 제품과 동일.
  // proposals는 judge()가 RelationJudgmentSchema로 이미 검증한 RelationProposal[].
  const { applied, pending } = gateProposals({
    proposals,
    labelToId,
    batchIds,
  });
  const predictions: GatedRelation[] = [
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

  return scorePredictions({ predictions, golden: scenario.golden });
}

function withType(precision: ReturnType<typeof precisionRecall>) {
  return {
    precision: round(precision.precision),
    recall: round(precision.recall),
    f1: round(precision.f1),
  };
}

async function main() {
  const openaiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!openaiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const llm = new OpenAiProvider({
    apiKey: openaiKey,
    model: DEFAULT_STANDARD_MODEL,
  });

  const started = Date.now();
  console.log(
    `시나리오 ${RELATION_SCENARIOS.length}개 × ${RUNS_PER_SCENARIO}회 판정 중...`,
  );

  // 각 (시나리오 × 회차)를 독립 채점 단위로 — 한 단위 실패가 나머지를 유실시키지 않게 격리.
  const contentOf = new Map(
    RELATION_SCENARIOS.flatMap((scenario) =>
      scenario.statements.map((s) => [`${scenario.id}:${s.id}`, s.content]),
    ),
  );
  const lookup = (scenarioId: string, statementId: string): string =>
    contentOf.get(`${scenarioId}:${statementId}`) ?? statementId;

  interface ScenarioRun {
    scenarioId: string;
    run: number;
    result: ScoreResult;
  }
  const runs: ScenarioRun[] = [];
  const failedRuns: Array<{ scenarioId: string; run: number; error: string }> =
    [];

  await Promise.all(
    RELATION_SCENARIOS.flatMap((scenario) =>
      Array.from({ length: RUNS_PER_SCENARIO }, (_, run) => async () => {
        try {
          const result = await runScenarioOnce({ llm, scenario });
          runs.push({ scenarioId: scenario.id, run, result });
        } catch (error) {
          failedRuns.push({
            scenarioId: scenario.id,
            run,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }).map((task) => task()),
    ),
  );

  if (runs.length === 0) {
    console.error("all runs failed — no metrics to report:");
    for (const failed of failedRuns) {
      console.error(`  - ${failed.scenarioId}#${failed.run}: ${failed.error}`);
    }
    process.exit(1);
  }

  const allResults = runs.map((r) => r.result);

  // 전체 집계 (micro — 모든 시나리오×회차 합산)
  const totalTp = allResults.reduce((sum, r) => sum + r.counts.truePositive, 0);
  const totalPredicted = allResults.reduce(
    (sum, r) => sum + r.scored.length,
    0,
  );
  // 골든 분모 = tp + missed + directionError — 방향만 틀린 골든은 missed에서 빠지므로(별도
  // 버킷) 여기 더해야 분모가 정밀도 쪽(scored.length = tp+de+fp)과 대칭이 된다. 빠뜨리면
  // 방향 오판이 생기는 순간 overall.recall이 조용히 부풀려진다.
  const totalGolden = allResults.reduce(
    (sum, r) =>
      sum + r.counts.truePositive + r.counts.missed + r.counts.directionError,
    0,
  );
  const overall = precisionRecall({
    truePositive: totalTp,
    predicted: totalPredicted,
    golden: totalGolden,
  });

  const typeTally = tallyByType(allResults);
  const byType = Object.fromEntries(
    Object.entries(typeTally).map(([type, t]) => [
      type,
      {
        ...t,
        ...withType(
          precisionRecall({
            truePositive: t.truePositive,
            predicted: t.truePositive + t.falsePositive + t.directionError,
            golden: t.truePositive + t.missed + t.directionError,
          }),
        ),
      },
    ]),
  );

  const appliedFps = appliedFalsePositives(allResults);

  // 실패 사례 전수 (결정 #7) — 시나리오·회차·원문 동봉해 사람이 골든 보정 가능하게.
  const falsePositives = runs.flatMap(({ scenarioId, run, result }) =>
    result.scored
      .filter((s) => s.verdict === "false-positive")
      .map((s) => ({
        scenarioId,
        run,
        type: s.prediction.type,
        gate: s.prediction.gate,
        from: lookup(scenarioId, s.prediction.from),
        to: lookup(scenarioId, s.prediction.to),
      })),
  );
  const directionErrors = runs.flatMap(({ scenarioId, run, result }) =>
    result.scored
      .filter((s) => s.verdict === "direction-error")
      .map((s) => ({
        scenarioId,
        run,
        type: s.prediction.type,
        from: lookup(scenarioId, s.prediction.from),
        to: lookup(scenarioId, s.prediction.to),
      })),
  );
  const missedGolden = runs.flatMap(({ scenarioId, run, result }) =>
    result.missedGolden.map((g) => ({
      scenarioId,
      run,
      type: g.type,
      from: lookup(scenarioId, g.from),
      to: lookup(scenarioId, g.to),
    })),
  );

  // typeTally(Record<string, TypeTally>)에서 직접 — byType은 precision 필드가 섞여 느슨한 타입.
  const supportsFpTotal = typeTally["supports"]?.falsePositive ?? 0;
  const conflictsFpTotal = typeTally["conflicts"]?.falsePositive ?? 0;
  const appliedSupportsFp = appliedFps.filter(
    (r) => r.type === "supports",
  ).length;

  const summary = {
    scenarios: RELATION_SCENARIOS.length,
    runsPerScenario: RUNS_PER_SCENARIO,
    evaluatedRuns: runs.length,
    failedRuns: failedRuns.length,
    overall: withType(overall),
    byType,
    // 헤드라인: 지어낸 supports(applied가 가장 해롭다)와 헛 충돌(conflicts FP — 이번 슬라이스 표적).
    // 충돌은 게이트가 늘 pending이라 applied FP는 supports/replaces/resolves뿐.
    headline: {
      supportsFalsePositives: supportsFpTotal,
      conflictsFalsePositives: conflictsFpTotal,
      appliedFalsePositives: appliedFps.length,
      appliedSupportsFalsePositives: appliedSupportsFp,
    },
  };

  const promptHash = createHash("sha1")
    .update(RELATION_JUDGMENT_SYSTEM_PROMPT)
    .digest("hex")
    .slice(0, PROMPT_HASH_LENGTH);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(__dirname, `results-judgment-${timestamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        // 프롬프트 지문 — 전후 결과 파일이 "어느 프롬프트로 잰 것인지" 자기증명
        promptHash,
        runsPerScenario: RUNS_PER_SCENARIO,
        failedRuns,
        summary,
        failures: { falsePositives, directionErrors, missedGolden },
      },
      null,
      2,
    ),
  );

  console.log(
    `\n=== 요약 (prompt ${promptHash}, ${Math.round((Date.now() - started) / 1000)}s) ===`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("eval run failed:", error);
  process.exit(1);
});
