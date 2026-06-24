// 모델 가성비 비교 하니스 (NEM-149) — 평가셋 × 모델 → 비용·지연·품질 비교표 + 이력 적재.
//
// 실행: apps/server에서  pnpm tsx src/eval/run-model-comparison.ts [옵션]
//   --models a,b,c     비교 모델 (기본: 카탈로그 단가 박힌 전 모델)
//   --functions x,y    비교 기능 (기본: extract,relate,narrate,draft)
//   --persist          결과를 staging eval_runs에 적재 (기본: JSON만 — 스모크 오염 방지)
// 필요 키: 비교 대상 모델의 프로바이더 키 + ANTHROPIC_API_KEY(추출 채점관, Claude 고정).
//
// 비교는 워크로드 모델뿐 — judge=Claude·임베딩=Voyage는 고정. 비용·지연은 metering 래퍼가
// 워크로드 모델 호출만 잰다(채점관 호출은 제외). 품질이 자동 채점되는 추출·관계만 점수가 있고,
// 해설·초안은 cost-only(품질은 measurement-log 수동 + 전용 러너). 모델 무관 인프라라
// NEM-168 §3 확정 전 잰 값은 잠정이다.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { LlmError } from "@server/infra/llm/llm-error";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  listModelSpecs,
  type LlmProviderId,
} from "@server/infra/llm/model-catalog";
import { createLlmProviderFromEnv } from "@server/infra/llm/model-factory";
import type { LlmTask } from "@server/infra/llm/task-routing";
import {
  buildFirstCallMessage,
  DRAFTING_SYSTEM_PROMPT,
} from "@server/prompts/drafting";
import { NARRATION_SYSTEM_PROMPT } from "@server/prompts/narration";
import { RELATION_JUDGMENT_SYSTEM_PROMPT } from "@server/prompts/relation-judgment";
import { STATEMENT_EXTRACTION_SYSTEM_PROMPT } from "@server/prompts/statement-extraction";

import {
  buildEvalRunRow,
  type EvalRunRow,
  persistEvalRuns,
} from "./eval-history";
import {
  createMeteringProvider,
  type MeteringProvider,
} from "./metering-provider";
import { buildNarrationMessage } from "./narration-core";
import { NARRATION_FIXTURES } from "./narration-marker-seed";
import { runScenarioOnce } from "./relation-engine/judgment-core";
import { precisionRecall } from "./relation-engine/metrics";
import { RELATION_SCENARIOS } from "./relation-engine/seed-data";
import { PHASE1_SEEDS } from "./seed-data";
import { extract, matchStatements } from "./statement-engine/extraction-core";
import { createJudge, type Judge } from "./statement-engine/judge";
import { scoreF1 } from "./statement-engine/metrics";
import { SEED_DOCUMENTS } from "./statement-engine/seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../.."));

const VERSION_HASH_LENGTH = 8;
const JUDGE_CONCURRENCY = 8;

function shortHash(value: unknown): string {
  return createHash("sha1")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, VERSION_HASH_LENGTH);
}

interface QualityResult {
  qualityScore: number | null;
  signals: Record<string, unknown>;
}

interface FunctionSpec {
  key: string;
  task: LlmTask;
  evalVersion: string;
  promptVersion: string;
  // 추출만 judge(Claude)를 쓴다 — 나머지는 받되 무시.
  evaluate: (llm: LlmProvider, judge: Judge) => Promise<QualityResult>;
}

// --- 추출 (쪼개기·분류) — golden F1 + 분류 정확도의 잠정 등가중 합성 ---
async function evaluateExtraction(
  llm: LlmProvider,
  judge: Judge,
): Promise<QualityResult> {
  let totalMatched = 0;
  let totalExtracted = 0;
  let totalGolden = 0;
  let typeCorrect = 0;
  let typeTotal = 0;
  // 순차 — 호출이 겹치면 지연에 큐잉이 섞인다. 모델 응답시간만 재려 한 콜씩.
  for (const doc of SEED_DOCUMENTS) {
    const statements = await extract(llm, doc.input);
    const match = await matchStatements({
      judge,
      left: statements,
      right: doc.goldenStatements,
      leftContent: (statement) => statement.content,
      rightContent: (golden) => golden.content,
    });
    totalMatched += match.pairs.length;
    totalExtracted += statements.length;
    totalGolden += doc.goldenStatements.length;
    for (const pair of match.pairs) {
      typeTotal += 1;
      if (pair.left.type === pair.right.type) {
        typeCorrect += 1;
      }
    }
  }
  const golden = scoreF1({
    matched: totalMatched,
    extracted: totalExtracted,
    golden: totalGolden,
  });
  const classificationAccuracy = typeTotal === 0 ? 0 : typeCorrect / typeTotal;
  return {
    qualityScore: (golden.f1 + classificationAccuracy) / 2,
    signals: {
      goldenF1: golden.f1,
      goldenPrecision: golden.precision,
      goldenRecall: golden.recall,
      classificationAccuracy,
    },
  };
}

// --- 관계 (잇기·합치기) — 코드 채점이라 관계 F1이 깨끗한 단일 헤드라인 ---
async function evaluateRelation(llm: LlmProvider): Promise<QualityResult> {
  let truePositive = 0;
  let predicted = 0;
  let golden = 0;
  let duplicateMatched = 0;
  let duplicatePredicted = 0;
  let duplicateExpected = 0;
  let appliedFalsePositives = 0;
  for (const scenario of RELATION_SCENARIOS) {
    const { relation, duplicate } = await runScenarioOnce({ llm, scenario });
    truePositive += relation.counts.truePositive;
    predicted += relation.scored.length;
    golden +=
      relation.counts.truePositive +
      relation.counts.missed +
      relation.counts.directionError;
    appliedFalsePositives += relation.scored.filter(
      (scored) =>
        scored.verdict === "false-positive" &&
        scored.prediction.gate === "applied",
    ).length;
    duplicateMatched += duplicate.matched;
    duplicatePredicted += duplicate.predicted;
    duplicateExpected += duplicate.expected;
  }
  const relationPR = precisionRecall({ truePositive, predicted, golden });
  const duplicatePR = precisionRecall({
    truePositive: duplicateMatched,
    predicted: duplicatePredicted,
    golden: duplicateExpected,
  });
  return {
    qualityScore: relationPR.f1,
    signals: {
      relationPrecision: relationPR.precision,
      relationRecall: relationPR.recall,
      relationF1: relationPR.f1,
      duplicateF1: duplicatePR.f1,
      appliedFalsePositives,
    },
  };
}

// --- 해설·초안 — cost-only. 출력을 소비해 metering이 토큰·지연을 걷게만 한다 ---
async function evaluateNarration(llm: LlmProvider): Promise<QualityResult> {
  for (const fixture of NARRATION_FIXTURES) {
    await drainStream({
      llm,
      systemPrompt: NARRATION_SYSTEM_PROMPT,
      message: buildNarrationMessage(fixture),
    });
  }
  return { qualityScore: null, signals: {} };
}

async function evaluateDrafting(llm: LlmProvider): Promise<QualityResult> {
  for (const seed of PHASE1_SEEDS) {
    await drainStream({
      llm,
      systemPrompt: DRAFTING_SYSTEM_PROMPT,
      message: buildFirstCallMessage(seed.input),
    });
  }
  return { qualityScore: null, signals: {} };
}

async function drainStream(params: {
  llm: LlmProvider;
  systemPrompt: string;
  message: string;
}): Promise<void> {
  // 토큰·지연은 metering이 걷는다 — 본문은 버린다.
  for await (const chunk of params.llm.generateStream({
    systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: params.message }],
  })) {
    void chunk;
  }
}

const FUNCTION_SPECS: FunctionSpec[] = [
  {
    key: "extract",
    task: "extractStatements",
    evalVersion: shortHash(SEED_DOCUMENTS),
    promptVersion: shortHash(STATEMENT_EXTRACTION_SYSTEM_PROMPT),
    evaluate: evaluateExtraction,
  },
  {
    key: "relate",
    task: "judgeRelations",
    evalVersion: shortHash(RELATION_SCENARIOS),
    promptVersion: shortHash(RELATION_JUDGMENT_SYSTEM_PROMPT),
    evaluate: (llm) => evaluateRelation(llm),
  },
  {
    key: "narrate",
    task: "narrate",
    evalVersion: shortHash(NARRATION_FIXTURES),
    promptVersion: shortHash(NARRATION_SYSTEM_PROMPT),
    evaluate: (llm) => evaluateNarration(llm),
  },
  {
    key: "draft",
    task: "generateDraft",
    evalVersion: shortHash(PHASE1_SEEDS),
    promptVersion: shortHash(DRAFTING_SYSTEM_PROMPT),
    evaluate: (llm) => evaluateDrafting(llm),
  },
];

function parseListArg(flag: string): string[] | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const raw = process.argv[index + 1];
  if (!raw || raw.startsWith("--")) {
    console.error(`${flag} requires a comma-separated value`);
    process.exit(1);
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function main() {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
  if (!anthropicKey) {
    console.error(
      "ANTHROPIC_API_KEY is required (extraction judge is Claude-locked)",
    );
    process.exit(1);
  }

  // 단가 박힌 모델만 비교 후보 — 단가 없으면 비용을 못 내 비교가 무의미.
  const pricedModels = listModelSpecs().filter((spec) => spec.pricing);
  const requestedModels = parseListArg("--models");
  const models = requestedModels
    ? pricedModels.filter((spec) => requestedModels.includes(spec.id))
    : pricedModels;

  const requestedFunctions = parseListArg("--functions");
  const functions = requestedFunctions
    ? FUNCTION_SPECS.filter((spec) => requestedFunctions.includes(spec.key))
    : FUNCTION_SPECS;
  const persist = process.argv.includes("--persist");

  if (models.length === 0 || functions.length === 0) {
    console.error("no models or functions selected");
    process.exit(1);
  }

  const judge = createJudge(anthropicKey, JUDGE_CONCURRENCY);
  const runAt = new Date().toISOString();
  const rows: EvalRunRow[] = [];
  const skipped: Array<{ model: string; reason: string }> = [];

  for (const model of models) {
    let baseProvider: LlmProvider;
    try {
      baseProvider = createLlmProviderFromEnv(model.id);
    } catch (error) {
      // 키 없는 프로바이더의 모델은 건너뛴다 — 한 모델 부재가 전체 측정을 막지 않게.
      skipped.push({
        model: model.id,
        reason: error instanceof LlmError ? error.message : String(error),
      });
      continue;
    }

    for (const fn of functions) {
      const meter = createMeteringProvider(baseProvider);
      const startedAt = Date.now();
      try {
        const quality = await fn.evaluate(meter.provider, judge);
        const row = buildRow({
          model: model.id,
          provider: model.provider,
          fn,
          meter,
          quality,
          runAt,
        });
        rows.push(row);
        console.log(
          `  ✓ [${model.id} · ${fn.key}] ${Math.round((Date.now() - startedAt) / 1000)}s — ` +
            `cost $${row.costUsd?.toFixed(6) ?? "n/a"}/call · ${row.latencyMs}ms · q=${row.qualityScore?.toFixed(3) ?? "n/a"}` +
            (row.selfPreference ? " ⚠️self-pref" : ""),
        );
      } catch (error) {
        console.log(
          `  ✗ [${model.id} · ${fn.key}] ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (rows.length === 0) {
    console.error("all measurements failed — nothing to report");
    for (const entry of skipped) {
      console.error(`  - skipped ${entry.model}: ${entry.reason}`);
    }
    process.exit(1);
  }

  printComparisonTable(rows);

  const timestamp = runAt.replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-model-comparison-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      { runAt, judgeUsage: judge.usage(), skipped, rows },
      null,
      2,
    ),
  );
  console.log(`\n결과 저장: ${outPath}`);

  if (persist) {
    await persistEvalRuns(rows);
    console.log(`staging eval_runs 적재: ${rows.length}행`);
  } else {
    console.log("(--persist 미지정 — staging 적재 생략)");
  }
}

function buildRow(params: {
  model: string;
  provider: LlmProviderId;
  fn: FunctionSpec;
  meter: MeteringProvider;
  quality: QualityResult;
  runAt: string;
}): EvalRunRow {
  const { fn } = params;
  // 추출만 judge가 Claude라, Claude 워크로드는 self-preference 편향 가능 — 행에 표식.
  const selfPreference =
    fn.task === "extractStatements" && params.provider === "anthropic";
  return buildEvalRunRow({
    model: params.model,
    provider: params.provider,
    task: fn.task,
    runAt: params.runAt,
    evalVersion: fn.evalVersion,
    promptVersion: fn.promptVersion,
    totals: params.meter.totals(),
    qualityScore: params.quality.qualityScore,
    selfPreference,
    signals: params.quality.signals,
  });
}

function printComparisonTable(rows: EvalRunRow[]): void {
  console.log("\n=== 가성비 비교 (동작당 비용·지연, 잠정 품질) ===");
  for (const fn of FUNCTION_SPECS) {
    const forFn = rows
      .filter((row) => row.task === fn.task)
      .sort(byQualityThenCost);
    if (forFn.length === 0) {
      continue;
    }
    console.log(
      `\n[${fn.key}] (eval ${forFn[0]?.evalVersion} · prompt ${forFn[0]?.promptVersion})`,
    );
    for (const row of forFn) {
      console.log(
        `  ${row.model.padEnd(28)} ` +
          `cost ${formatCost(row.costUsd)}  ` +
          `latency ${String(row.latencyMs).padStart(6)}ms  ` +
          `quality ${row.qualityScore === null ? "  n/a" : row.qualityScore.toFixed(3)}` +
          (row.selfPreference ? "  ⚠️" : ""),
      );
    }
  }
}

function byQualityThenCost(left: EvalRunRow, right: EvalRunRow): number {
  // 품질 내림차순(null은 뒤로), 같으면 비용 오름차순.
  const leftQuality = left.qualityScore ?? -1;
  const rightQuality = right.qualityScore ?? -1;
  if (leftQuality !== rightQuality) {
    return rightQuality - leftQuality;
  }
  return (left.costUsd ?? Infinity) - (right.costUsd ?? Infinity);
}

function formatCost(costUsd: number | null): string {
  return costUsd === null ? "    n/a" : `$${costUsd.toFixed(6)}`;
}

main().catch((error) => {
  console.error("model comparison run failed:", error);
  process.exit(1);
});
