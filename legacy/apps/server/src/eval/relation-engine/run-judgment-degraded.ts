// 관계 민감도 러너 — 시나리오를 뭉쳐(과소분할 모사) 관계가 어디서 깨지나 (NEM-168 태스크 8).
//
// 실행: apps/server에서  pnpm tsx src/eval/relation-engine/run-judgment-degraded.ts
//   --runs N : rate당 시나리오 반복 (기본 3 — LLM run 노이즈 완화)
// 필요 키: 측정 모델 키(EVAL_LLM_MODEL). 채점은 코드 정확 비교라 심판 LLM 없음.
//
// 왜: 추출 합격선을 "현재 값"으로 잡으면 앵커링이다. 거꾸로 추출을 깎아(뭉치기) 하류가
//   어디서 깨지나로 도출한다(§3 "아직 빈 것"). 검색은 작은 코퍼스라 recall이 포화됐다
//   (run-retrieval-degraded #14) — 관계가 과소분할의 진짜 binding constraint일 후보다.
// 뭉치기 = role별(new끼리·existing끼리) 인접 진술 합침. 두 가지 해를 함께 잰다:
//   ① 소멸(구조적): 골든 관계의 두 끝점이 한 진술로 합쳐지면 관계가 사라진다(judge 무관).
//   ② judge 누락: 살아남은 관계도 끝점이 뚱뚱해져 판정이 놓칠 수 있다.
// effectiveRecall = 원 골든 중 실제로 잡힌 비율(①+② 합산) — 이게 target 신호.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import { mergeByBoundaryRemoval } from "@server/eval/statement-engine/degrade";

import { runScenarioOnce } from "./judgment-core";
import { precisionRecall, round } from "./metrics";
import {
  type GoldenRelation,
  RELATION_SCENARIOS,
  type RelationScenario,
  type ScenarioStatement,
} from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const DEFAULT_RUNS_PER_SCENARIO = 3;
function parseRunsArg(): number {
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
// 0=baseline(불변, run-judgment 재현), 1=role별 전체 1진술. 곡선의 무너지는 지점이 target 단서.
const MERGE_RATES = [0, 0.25, 0.5, 0.75, 1] as const;

function toStatement(
  group: { id: string; content: string; members: ScenarioStatement[] },
  role: "new" | "existing",
): ScenarioStatement {
  const rep = group.members[0];
  return rep.type === "claim"
    ? {
        id: group.id,
        content: group.content,
        role,
        type: "claim",
        confidence: rep.confidence,
      }
    : { id: group.id, content: group.content, role, type: rep.type };
}

// 시나리오를 role별로 뭉치고 골든 관계를 합성 끝점으로 재매핑한다.
// 두 끝점이 같은 그룹이면 관계 소멸(destroyed) — 골든에서 빼고 따로 센다.
function degradeScenario(
  scenario: RelationScenario,
  rate: number,
): { scenario: RelationScenario; destroyed: number } {
  const newStmts = scenario.statements.filter((s) => s.role === "new");
  const existingStmts = scenario.statements.filter(
    (s) => s.role === "existing",
  );
  const newMerge = mergeByBoundaryRemoval(newStmts, rate);
  const existingMerge = mergeByBoundaryRemoval(existingStmts, rate);
  const remap = new Map<string, string>([
    ...newMerge.remap,
    ...existingMerge.remap,
  ]);

  const statements: ScenarioStatement[] = [
    ...newMerge.groups.map((g) => toStatement(g, "new")),
    ...existingMerge.groups.map((g) => toStatement(g, "existing")),
  ];

  let destroyed = 0;
  const seen = new Set<string>();
  const golden: GoldenRelation[] = [];
  for (const rel of scenario.golden) {
    const from = remap.get(rel.from) ?? rel.from;
    const to = remap.get(rel.to) ?? rel.to;
    if (from === to) {
      destroyed += 1;
      continue;
    }
    const key = `${from}|${to}|${rel.type}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    golden.push({ ...rel, from, to });
  }

  const expectedDuplicates = scenario.expectedDuplicates
    ?.map((d) => ({
      duplicate: remap.get(d.duplicate) ?? d.duplicate,
      of: remap.get(d.of) ?? d.of,
    }))
    .filter((d) => d.duplicate !== d.of);

  return {
    scenario: { ...scenario, statements, golden, expectedDuplicates },
    destroyed,
  };
}

interface RateReport {
  rate: number;
  destroyedFraction: number;
  effectiveRecall: number;
  survivorPrecision: number;
  survivorRecall: number;
  survivorF1: number;
}

async function measureRate(params: {
  llm: ReturnType<typeof createEvalLlm>;
  rate: number;
  originalGoldenUnits: number;
}): Promise<RateReport> {
  const { llm, rate, originalGoldenUnits } = params;

  let totalTp = 0;
  let totalPredicted = 0;
  let totalSurvivingGolden = 0;
  let destroyedTotal = 0;

  const units = RELATION_SCENARIOS.flatMap((scenario) =>
    Array.from({ length: RUNS_PER_SCENARIO }, () => scenario),
  );
  const results = await Promise.all(
    units.map(async (scenario) => {
      const degraded = degradeScenario(scenario, rate);
      const { relation } = await runScenarioOnce({
        llm,
        scenario: degraded.scenario,
      });
      return { relation, destroyed: degraded.destroyed };
    }),
  );

  for (const { relation, destroyed } of results) {
    totalTp += relation.counts.truePositive;
    totalPredicted += relation.scored.length;
    totalSurvivingGolden +=
      relation.counts.truePositive +
      relation.counts.missed +
      relation.counts.directionError;
    destroyedTotal += destroyed;
  }

  const survivor = precisionRecall({
    truePositive: totalTp,
    predicted: totalPredicted,
    golden: totalSurvivingGolden,
  });

  return {
    rate,
    destroyedFraction: round(destroyedTotal / originalGoldenUnits),
    // 원 골든 중 실제로 잡힌 비율 — 소멸(분자에서 빠짐)과 judge 누락을 함께 반영
    effectiveRecall: round(totalTp / originalGoldenUnits),
    survivorPrecision: round(survivor.precision),
    survivorRecall: round(survivor.recall),
    survivorF1: round(survivor.f1),
  };
}

async function main() {
  const llm = createEvalLlm();
  const goldenPerRun = RELATION_SCENARIOS.reduce(
    (sum, scenario) => sum + scenario.golden.length,
    0,
  );
  const originalGoldenUnits = goldenPerRun * RUNS_PER_SCENARIO;

  console.log(
    `관계 뭉치기 민감도 — 시나리오 ${RELATION_SCENARIOS.length}개 × ${RUNS_PER_SCENARIO}회, rate ${MERGE_RATES.join("/")} (모델 ${resolveEvalModelId()})`,
  );

  const reports: RateReport[] = [];
  for (const rate of MERGE_RATES) {
    const report = await measureRate({ llm, rate, originalGoldenUnits });
    reports.push(report);
    console.log(
      `  rate ${rate}: 소멸 ${report.destroyedFraction} · effectiveRecall ${report.effectiveRecall} · survivor F1 ${report.survivorF1} (P ${report.survivorPrecision}/R ${report.survivorRecall})`,
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-judgment-degraded-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        model: resolveEvalModelId(),
        runsPerScenario: RUNS_PER_SCENARIO,
        reports,
      },
      null,
      2,
    ),
  );
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("eval run failed:", error);
  process.exit(1);
});
