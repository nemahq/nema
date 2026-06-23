// 관계 판정 러너 (relation-design §5) — eval/statement-engine 패턴 미러
//
// 실행: apps/server에서  pnpm tsx src/eval/relation-engine/run-judgment.ts
//   --quick  : 시나리오당 1회만 (반복 안정화 생략 — 프롬프트 보정 빠른 루프)
//   --runs N : 시나리오당 N회 (전후 비교를 촘촘히 — 드문 FP를 안정적으로 잡기)
// 필요 키: 측정 모델 키(기본 OPENAI_API_KEY; EVAL_LLM_MODEL로 교체 가능). 채점은 코드 정확 비교라 심판 LLM 없음.
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
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import { RELATION_JUDGMENT_SYSTEM_PROMPT } from "@server/prompts/relation-judgment";

import { runScenarioOnce } from "./judgment-core";
import {
  appliedFalsePositives,
  type DuplicatePair,
  type DuplicateScore,
  precisionRecall,
  round,
  type ScoreResult,
  tallyByType,
} from "./metrics";
import { RELATION_SCENARIOS } from "./seed-data";

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
const PROMPT_HASH_LENGTH = 8;

function withType(precision: ReturnType<typeof precisionRecall>) {
  return {
    precision: round(precision.precision),
    recall: round(precision.recall),
    f1: round(precision.f1),
  };
}

async function main() {
  const llm = createEvalLlm();

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
    duplicate: DuplicateScore;
  }
  const runs: ScenarioRun[] = [];
  const failedRuns: Array<{ scenarioId: string; run: number; error: string }> =
    [];

  await Promise.all(
    RELATION_SCENARIOS.flatMap((scenario) =>
      Array.from({ length: RUNS_PER_SCENARIO }, (_, run) => async () => {
        try {
          const { relation, duplicate } = await runScenarioOnce({
            llm,
            scenario,
          });
          runs.push({
            scenarioId: scenario.id,
            run,
            result: relation,
            duplicate,
          });
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

  // 중복(같음) 집계 — micro. 과합치(falseMerges)가 가장 위험(서로 다른 사실을 뭉갬).
  const dupMatched = runs.reduce((s, r) => s + r.duplicate.matched, 0);
  const dupPredicted = runs.reduce((s, r) => s + r.duplicate.predicted, 0);
  const dupExpected = runs.reduce((s, r) => s + r.duplicate.expected, 0);
  const duplicatePR = precisionRecall({
    truePositive: dupMatched,
    predicted: dupPredicted,
    golden: dupExpected,
  });
  const toPair = (scenarioId: string, p: DuplicatePair) => ({
    a: lookup(scenarioId, p.a),
    b: lookup(scenarioId, p.b),
  });
  const duplicateFalseMerges = runs.flatMap(({ scenarioId, run, duplicate }) =>
    duplicate.falsePositives.map((p) => ({
      scenarioId,
      run,
      ...toPair(scenarioId, p),
    })),
  );
  const duplicateMissed = runs.flatMap(({ scenarioId, run, duplicate }) =>
    duplicate.missed.map((p) => ({
      scenarioId,
      run,
      ...toPair(scenarioId, p),
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
    // 같음(중복) 검출 — NEM-162. falseMerges = 과합치(서로 다른 사실을 뭉갠 것, 가장 위험).
    duplicates: {
      ...withType(duplicatePR),
      falseMerges: duplicateFalseMerges.length,
      missed: duplicateMissed.length,
    },
    // 충돌은 늘 pending이라(relation-design §5) applied 충돌 FP는 존재할 수 없다 — 그래서
    // applied 변종은 supports에만 둔다(헤드라인의 supports↔conflicts 비대칭 이유).
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
        model: resolveEvalModelId(),
        // 프롬프트 지문 — 전후 결과 파일이 "어느 프롬프트로 잰 것인지" 자기증명
        promptHash,
        runsPerScenario: RUNS_PER_SCENARIO,
        failedRuns,
        summary,
        failures: {
          falsePositives,
          directionErrors,
          missedGolden,
          duplicateFalseMerges,
          duplicateMissed,
        },
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
