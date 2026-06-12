// 쪼개기·분류·일관성 러너 (eval-design 3·4장)
//
// 실행: apps/server에서  pnpm tsx src/eval/statement-engine/run-extraction.ts
// 필요 키: OPENAI_API_KEY(추출), ANTHROPIC_API_KEY(심판) — loadEnv가 읽는다.
//
// 흐름: 글 6개 × 5회 추출(worker와 동일한 LLM 1콜)
//   1회차 → 골든 대조 F1 + 분류 대조 + 차원별 품질
//   5회 쌍 10개 → 일관성(쌍대 F1)
// 결과는 results-extraction-*.json — 집계 숫자 + 실패 사례 전수(결정 #7).

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마(필수 키·쌍 제약) 통과용 자리값
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { createTieredLlm } from "@server/infra/llm/models";
import {
  buildStatementExtractionMessage,
  type ExtractedStatement,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import { createJudge, type Judge, QUALITY_DIMENSIONS } from "./judge";
import {
  type EvalAxis,
  type GoldenStatement,
  SEED_DOCUMENTS,
  type SeedDocument,
} from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

/** 일관성 측정의 반복 수 (eval-design 3.3) — 1회차는 골든 대조·품질 채점을 겸한다 */
const RUNS_PER_DOC = 5;
const JUDGE_CONCURRENCY = 8;

type StatementType = ExtractedStatement["type"];
type Confidence = "certain" | "guess" | null;

interface NormalizedStatement {
  content: string;
  type: StatementType;
  confidence: Confidence;
}

// worker.ts의 normalizeStatements와 동일 규칙 — 평가도 제품과 같은 경로를 본다
function normalize(raw: ExtractedStatement[]): NormalizedStatement[] {
  return raw.map((statement) => ({
    content: statement.content,
    type: statement.type,
    confidence:
      statement.type === "claim" ? (statement.confidence ?? "guess") : null,
  }));
}

async function extract(
  llm: LlmProvider,
  body: string,
): Promise<NormalizedStatement[]> {
  const output = await llm.generateStructured({
    schema: StatementExtractionSchema,
    schemaName: "statement_extraction",
    systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildStatementExtractionMessage(body) },
    ],
  });
  return normalize(output.statements);
}

interface MatchParams<L, R> {
  judge: Judge;
  left: L[];
  right: R[];
  leftContent: (item: L) => string;
  rightContent: (item: R) => string;
}

interface MatchResult<L, R> {
  pairs: Array<{ left: L; right: R }>;
  unmatchedLeft: L[];
  unmatchedRight: R[];
}

// greedy 1:1 — 추출 원문 순서대로, 아직 짝 없는 상대와 심판 매칭 (eval-design 3.1)
async function matchStatements<L, R>(
  params: MatchParams<L, R>,
): Promise<MatchResult<L, R>> {
  const { judge, left, right, leftContent, rightContent } = params;
  const pairs: Array<{ left: L; right: R }> = [];
  const taken = new Set<R>();

  for (const leftItem of left) {
    for (const rightItem of right) {
      if (taken.has(rightItem)) {
        continue;
      }
      const verdict = await judge.sameMeaning(
        leftContent(leftItem),
        rightContent(rightItem),
      );
      if (verdict.pass) {
        pairs.push({ left: leftItem, right: rightItem });
        taken.add(rightItem);
        break;
      }
    }
  }

  const matchedLeft = new Set(pairs.map((pair) => pair.left));
  return {
    pairs,
    unmatchedLeft: left.filter((item) => !matchedLeft.has(item)),
    unmatchedRight: right.filter((item) => !taken.has(item)),
  };
}

interface PrecisionRecallF1 {
  precision: number;
  recall: number;
  f1: number;
}

// 양쪽 0개(잡담 글에서 0개 추출)는 만점 — "추출 0개가 정답"인 케이스
function scoreF1(counts: {
  matched: number;
  extracted: number;
  golden: number;
}): PrecisionRecallF1 {
  if (counts.extracted === 0 && counts.golden === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }
  const precision =
    counts.extracted === 0 ? 1 : counts.matched / counts.extracted;
  const recall = counts.golden === 0 ? 1 : counts.matched / counts.golden;
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

interface DocReport {
  docId: string;
  runStatementCounts: number[];
  golden: PrecisionRecallF1 & {
    matchedPairs: Array<{ extracted: string; goldenId: string }>;
    overExtracted: string[];
    missedGolden: Array<{ id: string; content: string; axes: EvalAxis[] }>;
  };
  classification: {
    typePairs: Array<{
      goldenId: string;
      expected: StatementType;
      actual: StatementType;
    }>;
    confidencePairs: Array<{
      goldenId: string;
      expected: Confidence;
      actual: Confidence;
    }>;
  };
  quality: Array<{
    statement: string;
    dimensions: Record<string, { pass: boolean; reason: string }>;
  }>;
  consistency: { pairwiseF1: number[]; mean: number };
}

async function evaluateDocument(params: {
  llm: LlmProvider;
  judge: Judge;
  doc: SeedDocument;
}): Promise<DocReport> {
  const { llm, judge, doc } = params;
  const runs = await Promise.all(
    Array.from({ length: RUNS_PER_DOC }, () => extract(llm, doc.input)),
  );
  const primary = runs[0] ?? [];

  // 골든 대조 (1회차)
  const match = await matchStatements({
    judge,
    left: primary,
    right: doc.goldenStatements,
    leftContent: (statement) => statement.content,
    rightContent: (golden) => golden.content,
  });
  const score = scoreF1({
    matched: match.pairs.length,
    extracted: primary.length,
    golden: doc.goldenStatements.length,
  });

  // 분류 대조 — 매칭 성공 쌍만 (eval-design 4장)
  const typePairs = match.pairs.map((pair) => ({
    goldenId: pair.right.id,
    expected: pair.right.type,
    actual: pair.left.type,
  }));
  const confidencePairs = match.pairs
    .filter((pair) => pair.right.type === "claim" && pair.left.type === "claim")
    .map((pair) => ({
      goldenId: pair.right.id,
      expected:
        (pair.right as GoldenStatement & { confidence?: Confidence })
          .confidence ?? null,
      actual: pair.left.confidence,
    }));

  // 차원별 품질 (1회차 추출 전체)
  const quality = await Promise.all(
    primary.map(async (statement) => {
      const entries = await Promise.all(
        QUALITY_DIMENSIONS.map(async (dimension) => {
          const verdict = await judge.quality({
            dimension,
            source: doc.input,
            statement: statement.content,
          });
          return [dimension, verdict] as const;
        }),
      );
      return {
        statement: statement.content,
        dimensions: Object.fromEntries(entries),
      };
    }),
  );

  // 일관성 — 5회 쌍 10개의 쌍대 F1 (eval-design 3.3)
  const pairwiseF1: number[] = [];
  for (const [indexA, runA] of runs.entries()) {
    for (const runB of runs.slice(indexA + 1)) {
      if (runA.length === 0 && runB.length === 0) {
        pairwiseF1.push(1);
        continue;
      }
      const pairMatch = await matchStatements({
        judge,
        left: runA,
        right: runB,
        leftContent: (statement) => statement.content,
        rightContent: (statement) => statement.content,
      });
      pairwiseF1.push(
        scoreF1({
          matched: pairMatch.pairs.length,
          extracted: runA.length,
          golden: runB.length,
        }).f1,
      );
    }
  }
  const consistencyMean =
    pairwiseF1.reduce((sum, value) => sum + value, 0) / pairwiseF1.length;

  return {
    docId: doc.id,
    runStatementCounts: runs.map((run) => run.length),
    golden: {
      precision: round(score.precision),
      recall: round(score.recall),
      f1: round(score.f1),
      matchedPairs: match.pairs.map((pair) => ({
        extracted: pair.left.content,
        goldenId: pair.right.id,
      })),
      overExtracted: match.unmatchedLeft.map((statement) => statement.content),
      missedGolden: match.unmatchedRight.map((golden) => ({
        id: golden.id,
        content: golden.content,
        axes: golden.axes,
      })),
    },
    classification: { typePairs, confidencePairs },
    quality,
    consistency: {
      pairwiseF1: pairwiseF1.map(round),
      mean: round(consistencyMean),
    },
  };
}

function buildConfusionMatrix(
  pairs: Array<{ expected: StatementType; actual: StatementType }>,
): Record<StatementType, Record<StatementType, number>> {
  const types: StatementType[] = ["claim", "question", "todo"];
  const matrix = Object.fromEntries(
    types.map((expected) => [
      expected,
      Object.fromEntries(types.map((actual) => [actual, 0])),
    ]),
  ) as Record<StatementType, Record<StatementType, number>>;
  for (const pair of pairs) {
    matrix[pair.expected][pair.actual] += 1;
  }
  return matrix;
}

async function main() {
  const openaiKey = process.env["OPENAI_API_KEY"]?.trim();
  const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
  if (!openaiKey || !anthropicKey) {
    console.error("OPENAI_API_KEY and ANTHROPIC_API_KEY are required");
    process.exit(1);
  }

  const llm = createTieredLlm({ apiKey: openaiKey }).standard;
  const judge = createJudge(anthropicKey, JUDGE_CONCURRENCY);

  const reports: DocReport[] = [];
  for (const doc of SEED_DOCUMENTS) {
    console.log(`[${doc.id}] 추출 ${RUNS_PER_DOC}회 + 채점 중...`);
    const started = Date.now();
    reports.push(await evaluateDocument({ llm, judge, doc }));
    console.log(`  ✓ ${Math.round((Date.now() - started) / 1000)}s`);
  }

  // 집계
  const totalMatched = reports.reduce(
    (sum, report) => sum + report.golden.matchedPairs.length,
    0,
  );
  const totalExtracted = reports.reduce(
    (sum, report) =>
      sum +
      report.golden.matchedPairs.length +
      report.golden.overExtracted.length,
    0,
  );
  const totalGolden = SEED_DOCUMENTS.reduce(
    (sum, doc) => sum + doc.goldenStatements.length,
    0,
  );
  const micro = scoreF1({
    matched: totalMatched,
    extracted: totalExtracted,
    golden: totalGolden,
  });

  const allTypePairs = reports.flatMap(
    (report) => report.classification.typePairs,
  );
  const typeAccuracy =
    allTypePairs.length === 0
      ? null
      : allTypePairs.filter((pair) => pair.expected === pair.actual).length /
        allTypePairs.length;
  const allConfidencePairs = reports.flatMap(
    (report) => report.classification.confidencePairs,
  );
  const confidenceAccuracy =
    allConfidencePairs.length === 0
      ? null
      : allConfidencePairs.filter((pair) => pair.expected === pair.actual)
          .length / allConfidencePairs.length;

  const qualityRates = Object.fromEntries(
    QUALITY_DIMENSIONS.map((dimension) => {
      const verdicts = reports.flatMap((report) =>
        report.quality.flatMap((entry) => {
          const verdict = entry.dimensions[dimension];
          return verdict ? [verdict] : [];
        }),
      );
      const passRate =
        verdicts.length === 0
          ? null
          : verdicts.filter((verdict) => verdict.pass).length / verdicts.length;
      return [dimension, passRate === null ? null : round(passRate)];
    }),
  );

  // 축별 recall — 골든이 매칭됐는지를 축 태그로 집계 (실패 분석의 1급 산출물)
  const axisTally = new Map<EvalAxis, { total: number; missed: number }>();
  for (const doc of SEED_DOCUMENTS) {
    const report = reports.find((entry) => entry.docId === doc.id);
    if (!report) {
      continue;
    }
    const missedIds = new Set(
      report.golden.missedGolden.map((missed) => missed.id),
    );
    for (const golden of doc.goldenStatements) {
      for (const axis of golden.axes) {
        const tally = axisTally.get(axis) ?? { total: 0, missed: 0 };
        tally.total += 1;
        if (missedIds.has(golden.id)) {
          tally.missed += 1;
        }
        axisTally.set(axis, tally);
      }
    }
  }

  const consistencyMean = round(
    reports.reduce((sum, report) => sum + report.consistency.mean, 0) /
      reports.length,
  );

  const summary = {
    golden: {
      precision: round(micro.precision),
      recall: round(micro.recall),
      f1: round(micro.f1),
    },
    classification: {
      typeAccuracy: typeAccuracy === null ? null : round(typeAccuracy),
      typeConfusion: buildConfusionMatrix(allTypePairs),
      confidenceAccuracy:
        confidenceAccuracy === null ? null : round(confidenceAccuracy),
    },
    quality: qualityRates,
    consistencyMean,
    axisRecall: Object.fromEntries(
      [...axisTally.entries()].map(([axis, tally]) => [
        axis,
        { total: tally.total, missed: tally.missed },
      ]),
    ),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(__dirname, `results-extraction-${timestamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        runsPerDoc: RUNS_PER_DOC,
        judgeUsage: judge.usage(),
        summary,
        documents: reports,
      },
      null,
      2,
    ),
  );

  console.log("\n=== 요약 ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main();
