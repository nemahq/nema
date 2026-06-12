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

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마(필수 키·쌍 제약) 통과용 자리값.
// URL·KEY는 "둘 다 있거나 둘 다 없거나"라 쌍으로 박는다 (커밋된 .env에 숨어 기대지 않게).
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  EXTRACTION_REASONING_EFFORT,
  EXTRACTION_TIMEOUT_MS as WORKER_EXTRACTION_TIMEOUT_MS,
} from "@server/infra/statement-sync/worker";
import {
  buildStatementExtractionMessage,
  type ExtractedStatement,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import {
  createJudge,
  createLimiter,
  type Judge,
  QUALITY_DIMENSIONS,
} from "./judge";
import { type PrecisionRecallF1, round, scoreF1 } from "./metrics";
import { type EvalAxis, SEED_DOCUMENTS, type SeedDocument } from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

/** 일관성 측정의 반복 수 (eval-design 3.3) — 1회차는 골든 대조·품질 채점을 겸한다 */
// --quick: 1회만 추출해 일관성(5회 쌍대)을 생략 — 프롬프트 반복 보정용 빠른 루프
const RUNS_PER_DOC = process.argv.includes("--quick") ? 1 : 5;
const JUDGE_CONCURRENCY = 8;
// 글×반복 전부(30콜)를 동시에 쏘면 gpt-5가 제공자 타임아웃을 넘긴다 — 상한 필수
const EXTRACTION_CONCURRENCY = 4;
const EXTRACTION_MAX_ATTEMPTS = 3;

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

const limitExtraction = createLimiter(EXTRACTION_CONCURRENCY);

async function extract(
  llm: LlmProvider,
  body: string,
): Promise<NormalizedStatement[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < EXTRACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      const output = await limitExtraction(() =>
        llm.generateStructured({
          schema: StatementExtractionSchema,
          schemaName: "statement_extraction",
          systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildStatementExtractionMessage(body) },
          ],
          // 제품(worker)과 동일 설정 — 평가가 제품과 같은 경로를 본다
          reasoningEffort: EXTRACTION_REASONING_EFFORT,
          timeoutMs: WORKER_EXTRACTION_TIMEOUT_MS,
        }),
      );
      return normalize(output.statements);
    } catch (error) {
      lastError = error;
      console.warn(
        `  추출 재시도 ${attempt + 1}/${EXTRACTION_MAX_ATTEMPTS}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw lastError;
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

// greedy 1:1 — 추출 원문 순서대로, 아직 짝 없는 상대와 매칭 (eval-design 3.1).
// 판정 행렬을 병렬로 선계산하고 배정만 순차로 — greedy 결과는 순차 판정과 동일,
// 벽시계 시간이 동시성만큼 줄어든다 (조기 종료가 없어 판정 호출 수는 늘지만
// 판정 캐시·동일 문자열 지름길이 흡수한다).
// 배정이 좌측 순서 기준이라 쌍대 일관성(runA↔runB)에서 방향에 따라 미세히 다를 수
// 있는 근사다 — 현 규모(쌍당 진술 ~10개)에서 영향은 무시 수준.
async function matchStatements<L, R>(
  params: MatchParams<L, R>,
): Promise<MatchResult<L, R>> {
  const { judge, left, right, leftContent, rightContent } = params;

  const verdictMatrix = await Promise.all(
    left.map((leftItem) =>
      Promise.all(
        right.map((rightItem) =>
          judge
            .sameMeaning(leftContent(leftItem), rightContent(rightItem))
            .then((verdict) => verdict.pass),
        ),
      ),
    ),
  );

  const pairs: Array<{ left: L; right: R }> = [];
  const takenRight = new Set<number>();
  for (const [leftIndex, leftItem] of left.entries()) {
    const verdictRow = verdictMatrix[leftIndex] ?? [];
    for (const [rightIndex, rightItem] of right.entries()) {
      if (takenRight.has(rightIndex) || !verdictRow[rightIndex]) {
        continue;
      }
      pairs.push({ left: leftItem, right: rightItem });
      takenRight.add(rightIndex);
      break;
    }
  }

  const matchedLeft = new Set(pairs.map((pair) => pair.left));
  return {
    pairs,
    unmatchedLeft: left.filter((item) => !matchedLeft.has(item)),
    unmatchedRight: right.filter((_, index) => !takenRight.has(index)),
  };
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
  consistency: { pairwiseF1: number[]; mean: number | null };
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
  const confidencePairs = match.pairs.flatMap((pair) => {
    const golden = pair.right;
    const extracted = pair.left;
    if (golden.type !== "claim" || extracted.type !== "claim") {
      return [];
    }
    return [
      {
        goldenId: golden.id,
        expected: golden.confidence,
        actual: extracted.confidence,
      },
    ];
  });

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

  // 일관성 — 5회 쌍 10개의 쌍대 F1 (eval-design 3.3). 쌍은 서로 독립이라 동시 처리
  const runPairs = runs.flatMap((runA, indexA) =>
    runs.slice(indexA + 1).map((runB) => ({ runA, runB })),
  );
  const pairwiseF1 = await Promise.all(
    runPairs.map(async ({ runA, runB }) => {
      if (runA.length === 0 && runB.length === 0) {
        return 1;
      }
      const pairMatch = await matchStatements({
        judge,
        left: runA,
        right: runB,
        leftContent: (statement) => statement.content,
        rightContent: (statement) => statement.content,
      });
      return scoreF1({
        matched: pairMatch.pairs.length,
        extracted: runA.length,
        golden: runB.length,
      }).f1;
    }),
  );
  const consistencyMean =
    pairwiseF1.length === 0
      ? null
      : pairwiseF1.reduce((sum, value) => sum + value, 0) / pairwiseF1.length;

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
      mean: consistencyMean === null ? null : round(consistencyMean),
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

  // 타임아웃·reasoning은 호출 단위로 worker와 동일하게 전달된다 (extract 참고)
  const llm = new OpenAiProvider({
    apiKey: openaiKey,
    model: DEFAULT_STANDARD_MODEL,
  });
  const judge = createJudge(anthropicKey, JUDGE_CONCURRENCY);

  // 글은 서로 독립이라 동시 처리 — 동시성 상한은 judge의 limiter가 잡는다.
  // 글 단위로 오류를 격리 — 한 글의 실패가 나머지 글의 (비용 지불된) 결과를 유실시키지 않게.
  const started = Date.now();
  console.log(
    `글 ${SEED_DOCUMENTS.length}개 × ${RUNS_PER_DOC}회 추출 + 채점 중...`,
  );
  const reports: DocReport[] = [];
  const failedDocs: Array<{ docId: string; error: string }> = [];
  await Promise.all(
    SEED_DOCUMENTS.map(async (doc) => {
      try {
        const report = await evaluateDocument({ llm, judge, doc });
        reports.push(report);
        console.log(
          `  ✓ [${doc.id}] ${Math.round((Date.now() - started) / 1000)}s`,
        );
      } catch (error) {
        failedDocs.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(
          `  ✗ [${doc.id}] ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  // 전 글 실패면 집계가 0/0 만점으로 둔갑한다 — 가짜 성공 차단
  if (reports.length === 0) {
    console.error("all documents failed — no metrics to report:");
    for (const failed of failedDocs) {
      console.error(`  - ${failed.docId}: ${failed.error}`);
    }
    process.exit(1);
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
  // 실패한 글의 골든은 분모에서 제외 — 평가 안 된 항목이 recall을 깎으면 안 됨
  const evaluatedDocs = SEED_DOCUMENTS.filter((doc) =>
    reports.some((report) => report.docId === doc.id),
  );
  const totalGolden = evaluatedDocs.reduce(
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

  const docConsistencies = reports.flatMap((report) =>
    report.consistency.mean === null ? [] : [report.consistency.mean],
  );
  const consistencyMean =
    docConsistencies.length === 0
      ? null
      : round(
          docConsistencies.reduce((sum, value) => sum + value, 0) /
            docConsistencies.length,
        );

  const summary = {
    docs: {
      total: SEED_DOCUMENTS.length,
      evaluated: reports.length,
      failed: failedDocs.length,
    },
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
        failedDocs,
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

main().catch((error) => {
  console.error("eval run failed:", error);
  process.exit(1);
});
