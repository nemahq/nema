// 길이별 추출 측정 러너 — 두 모드
//
// ① 곡선 모드 (기본): 분할 없는 1콜의 길이별 지연·진술 수 곡선.
//    초장문 분할의 관문 측정(measurement-log #5)이 이 모드였다.
//    실행: pnpm tsx src/eval/statement-engine/run-length-curve.ts
//    필요 키: OPENAI_API_KEY
//
// ② 분할 A/B 모드 (--split): 임계선 초과 급간을 1콜 vs 분할 경로로 비교
//    (long-input-chunking 6장의 검증 1·2층). 지연·일관성(쌍대 F1)·품질 3차원·
//    경계 창 요소 포괄성 + 상한 합성 입력의 다청크 구조 검증.
//    실행: pnpm tsx src/eval/statement-engine/run-length-curve.ts --split
//    필요 키: OPENAI_API_KEY(추출), ANTHROPIC_API_KEY(심판)
//
// 타임아웃은 제품선(EXTRACTION_TIMEOUT_MS)보다 길게 풀어 "잘렸다"가 아니라
// "실제 몇 초 걸렸다"를 남긴다. SDK 묵시 재시도는 양 모드 모두 차단(곡선 오염 방지).

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마(필수 키·쌍 제약) 통과용 자리값.
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { LlmError } from "@server/infra/llm/llm-error";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  chunkForExtraction,
  countTokens,
  EXTRACTION_CHUNK_THRESHOLD_TOKENS,
  type ExtractionChunk,
} from "@server/infra/statement-sync/chunking";
import {
  EXTRACTION_EFFORT,
  EXTRACTION_TIMEOUT_MS as PRODUCT_TIMEOUT_MS,
} from "@server/infra/statement-sync/worker";
import {
  buildStatementExtractionMessage,
  type ExtractedStatement,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import { createJudge, createLimiter, type Judge } from "./judge";
import { buildUpperBoundInput, LONG_INPUT_SEEDS } from "./long-input-seeds";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

/** 급간당 반복 — 지연의 변동폭과 진술 수 분산을 보려면 1회로는 부족 */
const RUNS_PER_SEED = 3;
/** 동시 호출 상한 — 워커(LLM_CALL_CONCURRENCY)와 동일 */
const CONCURRENCY = 3;
/** 제품선보다 길게 풀어 실제 소요를 본다 — 측정의 목적은 통과/실패가 아니라 모양 */
const CURVE_TIMEOUT_MS = 180_000;
/** 콘솔 요약의 칼럼 폭 (시드 id / 토큰 수) */
const SEED_ID_COL_WIDTH = 24;
const TOKEN_COL_WIDTH = 5;
const JUDGE_CONCURRENCY = 8;
/**
 * 일관성 매칭의 후보 사전 선별 — 진술 ~100개 목록의 전수 쌍 판정(n×m)은 심판
 * 호출이 조합 폭발한다. 문자 2-gram 자카드 상위 K만 판정하는 근사 — 의미가 같은
 * 진술은 핵심 명사를 공유하므로 진짜 짝이 후보 밖일 확률이 낮고, 놓치면 F1이
 * 보수적으로(낮게) 측정된다.
 */
const MATCH_CANDIDATES_PER_STATEMENT = 3;
/** 경계 창 — 경계 양쪽에서 떼어 요소를 열거하는 원문 구간(문자) */
const BOUNDARY_WINDOW_CHARS = 600;

type Mode = "curve" | "split-ab";

// --- 공통: 추출 콜 ---

async function callExtraction(
  llm: OpenAiProvider,
  chunk: ExtractionChunk,
): Promise<ExtractedStatement[]> {
  const output = await llm.generateStructured({
    schema: StatementExtractionSchema,
    schemaName: "statement_extraction",
    systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildStatementExtractionMessage(chunk.body, {
          before: chunk.contextBefore,
          after: chunk.contextAfter,
        }),
      },
    ],
    effort: EXTRACTION_EFFORT,
    timeoutMs: CURVE_TIMEOUT_MS,
    // SDK 묵시 재시도(기본 2회)가 끼면 합산 시간이 단일 콜 지연으로 기록돼
    // 측정이 오염된다 — 워커와 동일하게 끈다
    maxRetries: 0,
  });
  return output.statements;
}

function describeError(err: unknown): string {
  // 분류 코드(timeout/rate_limit/…)를 함께 남긴다 — 사후 집계가 message 문자열에 안 기대게
  if (err instanceof LlmError) {
    return `[${err.code}] ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// --- 곡선 모드 (measurement-log #5의 도구, 변경 없음) ---

interface CurveRun {
  runIndex: number;
  latencyMs: number;
  statementCount: number | null;
  /** 제품 타임아웃 기준이었다면 잘렸을 호출 */
  exceedsProductTimeout: boolean;
  error: string | null;
  statements: ExtractedStatement[] | null;
}

interface CurvePoint {
  seedId: string;
  description: string;
  inputTokens: number;
  inputChars: number;
  runs: CurveRun[];
}

async function measureSingleRun(params: {
  llm: OpenAiProvider;
  body: string;
  runIndex: number;
}): Promise<CurveRun> {
  const { llm, body, runIndex } = params;
  const startedAt = Date.now();
  try {
    const statements = await callExtraction(llm, {
      body,
      contextBefore: null,
      contextAfter: null,
    });
    const latencyMs = Date.now() - startedAt;
    return {
      runIndex,
      latencyMs,
      statementCount: statements.length,
      exceedsProductTimeout: latencyMs > PRODUCT_TIMEOUT_MS,
      error: null,
      statements,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    return {
      runIndex,
      latencyMs,
      statementCount: null,
      exceedsProductTimeout: latencyMs > PRODUCT_TIMEOUT_MS,
      error: describeError(err),
      statements: null,
    };
  }
}

function summarizeCurvePoint(point: CurvePoint): string {
  const ok = point.runs.filter((r) => r.error === null);
  // 실패 런의 지연은 타임아웃 절단값일 수 있어 실측처럼 읽히지 않게 표시한다
  const latencies = point.runs.map(
    (r) => (r.latencyMs / 1000).toFixed(1) + "s" + (r.error ? "(오류)" : ""),
  );
  const counts = ok.map((r) => r.statementCount).join("/");
  const over = point.runs.filter((r) => r.exceedsProductTimeout).length;
  const errors = point.runs.length - ok.length;
  return [
    point.seedId.padEnd(SEED_ID_COL_WIDTH),
    String(point.inputTokens).padStart(TOKEN_COL_WIDTH) + " tok",
    "지연 " + latencies.join(" "),
    "진술 " + (counts || "-"),
    over > 0 ? `제품선 초과 ${over}/${point.runs.length}` : "제품선 이내",
    errors > 0 ? `오류 ${errors}` : "",
  ]
    .filter(Boolean)
    .join("  ");
}

async function runCurveMode(llm: OpenAiProvider): Promise<unknown> {
  const limit = createLimiter(CONCURRENCY);
  const points: CurvePoint[] = await Promise.all(
    LONG_INPUT_SEEDS.map(async (seed) => {
      const runs = await Promise.all(
        Array.from({ length: RUNS_PER_SEED }, (_, runIndex) =>
          limit(() => measureSingleRun({ llm, body: seed.input, runIndex })),
        ),
      );
      const point: CurvePoint = {
        seedId: seed.id,
        description: seed.description,
        inputTokens: countTokens(seed.input),
        inputChars: seed.input.length,
        runs,
      };
      console.log(summarizeCurvePoint(point));
      return point;
    }),
  );
  return { points };
}

// --- 분할 A/B 모드 ---

interface SplitRun {
  runIndex: number;
  wallMs: number;
  chunkCount: number;
  chunkLatenciesMs: number[];
  /** 청크 순서대로 연결된 진술 (워커의 연결 계약과 동일) */
  statements: ExtractedStatement[] | null;
  statementsPerChunk: number[] | null;
  error: string | null;
}

async function measureSplitRun(params: {
  llm: OpenAiProvider;
  chunks: ExtractionChunk[];
  runIndex: number;
}): Promise<SplitRun> {
  const { llm, chunks, runIndex } = params;
  const limit = createLimiter(CONCURRENCY);
  const startedAt = Date.now();
  const chunkLatenciesMs: number[] = new Array(chunks.length).fill(0);

  const settled = await Promise.allSettled(
    chunks.map((chunk, i) =>
      limit(async () => {
        const chunkStart = Date.now();
        try {
          return await callExtraction(llm, chunk);
        } finally {
          chunkLatenciesMs[i] = Date.now() - chunkStart;
        }
      }),
    ),
  );
  const wallMs = Date.now() - startedAt;

  const failed = settled.find(
    (s): s is PromiseRejectedResult => s.status === "rejected",
  );
  if (failed) {
    return {
      runIndex,
      wallMs,
      chunkCount: chunks.length,
      chunkLatenciesMs,
      statements: null,
      statementsPerChunk: null,
      error: describeError(failed.reason),
    };
  }

  const perChunk = settled.map((s) =>
    s.status === "fulfilled" ? s.value : [],
  );
  return {
    runIndex,
    wallMs,
    chunkCount: chunks.length,
    chunkLatenciesMs,
    statements: perChunk.flat(),
    statementsPerChunk: perChunk.map((statements) => statements.length),
    error: null,
  };
}

// 일관성 매칭 — 사전 선별 + greedy 1:1 (run-extraction의 매칭과 같은 정의,
// 후보만 자카드 상위 K로 줄인 근사. 상수 주석 참고)
function bigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
}

async function pairwiseF1(params: {
  judge: Judge;
  left: string[];
  right: string[];
}): Promise<number> {
  const { judge, left, right } = params;
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 1 : 0;
  }
  const rightGrams = right.map(bigrams);
  const candidates = left.map((statement) => {
    const grams = bigrams(statement);
    return rightGrams
      .map((g, j) => ({ j, score: jaccard(grams, g) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MATCH_CANDIDATES_PER_STATEMENT)
      .map(({ j }) => j);
  });

  // 심판 변칙 응답은 불일치로 간주 — 매칭 누락은 F1을 보수적으로(낮게) 만들 뿐
  const verdicts = await Promise.all(
    left.map((statement, i) =>
      Promise.all(
        (candidates[i] ?? []).map((j) =>
          judge
            .sameMeaning(statement, right[j] ?? "")
            .then((v) => v.pass)
            .catch(() => false),
        ),
      ),
    ),
  );

  const taken = new Set<number>();
  let matched = 0;
  for (let i = 0; i < left.length; i++) {
    const candidateRow = candidates[i] ?? [];
    const verdictRow = verdicts[i] ?? [];
    for (let k = 0; k < candidateRow.length; k++) {
      const j = candidateRow[k];
      if (j === undefined || taken.has(j) || !verdictRow[k]) {
        continue;
      }
      taken.add(j);
      matched += 1;
      break;
    }
  }
  return (2 * matched) / (left.length + right.length);
}

async function consistencyOfRuns(
  judge: Judge,
  runs: Array<ExtractedStatement[] | null>,
): Promise<number[]> {
  const lists = runs.filter((r): r is ExtractedStatement[] => r !== null);
  const pairs: Array<[string[], string[]]> = [];
  for (let a = 0; a < lists.length; a++) {
    for (let b = a + 1; b < lists.length; b++) {
      pairs.push([
        (lists[a] ?? []).map((s) => s.content),
        (lists[b] ?? []).map((s) => s.content),
      ]);
    }
  }
  return Promise.all(
    pairs.map(([left, right]) => pairwiseF1({ judge, left, right })),
  );
}

/**
 * 품질 채점 표본 크기 — 판정마다 원문 전체(2.7~5.3k토큰)를 동봉해 전수 채점은
 * 비용·시간의 지배 항목이 된다. pass율 추정엔 균등 간격 표본 40개로 충분.
 */
const QUALITY_SAMPLE_PER_LIST = 40;

/** 균등 간격 표본 — 결정적(무작위 없음), 원문 위치 분포를 보존 */
function sampleEvenly<T>(items: T[], size: number): T[] {
  if (items.length <= size) {
    return items;
  }
  const step = items.length / size;
  return Array.from(
    { length: size },
    (_, i) => items[Math.floor(i * step)] as T,
  );
}

async function qualityPassRates(params: {
  judge: Judge;
  source: string;
  statements: ExtractedStatement[];
}): Promise<{ rates: Record<string, number>; judgeFailures: number }> {
  const { judge, source, statements } = params;
  const sampled = sampleEvenly(statements, QUALITY_SAMPLE_PER_LIST);
  const dims = ["atomicity", "selfContained", "faithfulness"] as const;
  const rates: Record<string, number> = {};
  let judgeFailures = 0;
  for (const dimension of dims) {
    // 심판의 변칙 응답(산문·잘림)이 측정 전체를 죽이지 않게 판정 단위로 격리 —
    // 실패는 모수에서 빼고 세어 보고한다
    const verdicts = await Promise.all(
      sampled.map((s) =>
        judge
          .quality({ dimension, source, statement: s.content })
          .then((v) => v.pass as boolean | null)
          .catch(() => null),
      ),
    );
    const judged = verdicts.filter((v): v is boolean => v !== null);
    judgeFailures += verdicts.length - judged.length;
    rates[dimension] =
      judged.length === 0 ? 1 : judged.filter(Boolean).length / judged.length;
  }
  return { rates, judgeFailures };
}

interface CoverageResult {
  window: string;
  elementCount: number;
  covered: number;
  misses: Array<{ element: string; reason: string }>;
}

// 경계 창 요소 포괄성 — 경계 양쪽 원문에서 정보 단위를 열거하고, 인접 두 청크의
// 추출 진술이 각 단위를 덮는지 판정 (long-input-chunking 6장, Claimify 방식)
async function boundaryCoverage(params: {
  judge: Judge;
  chunks: ExtractionChunk[];
  statementsPerChunk: ExtractedStatement[][];
}): Promise<{ boundaries: CoverageResult[]; control: CoverageResult | null }> {
  const { judge, chunks, statementsPerChunk } = params;

  async function coverageOf(args: {
    windowLabel: string;
    windowText: string;
    statements: string[];
  }): Promise<CoverageResult> {
    const { windowLabel, windowText, statements } = args;
    const elements = await judge.listElements(windowText);
    const verdicts = await Promise.all(
      elements.map((element) => judge.elementCovered(element, statements)),
    );
    return {
      window: windowLabel,
      elementCount: elements.length,
      covered: verdicts.filter((v) => v.pass).length,
      misses: elements
        .map((element, i) => ({
          element,
          reason: verdicts[i]?.reason ?? "",
        }))
        .filter((_, i) => !(verdicts[i]?.pass ?? true)),
    };
  }

  const boundaries = await Promise.all(
    chunks.slice(0, -1).map((chunk, i) => {
      const next = chunks[i + 1];
      const windowText =
        chunk.body.slice(-BOUNDARY_WINDOW_CHARS) +
        (next?.body.slice(0, BOUNDARY_WINDOW_CHARS) ?? "");
      const statements = [
        ...(statementsPerChunk[i] ?? []),
        ...(statementsPerChunk[i + 1] ?? []),
      ].map((s) => s.content);
      return coverageOf({
        windowLabel: `boundary-${i}`,
        windowText,
        statements,
      });
    }),
  );

  // 대조군 — 경계가 아닌 청크 한복판. 경계 누락이 "경계라서"인지
  // "추출이 원래 그만큼 흘리는지"를 가르는 기준선.
  const first = chunks[0];
  const firstStatements = statementsPerChunk[0];
  let control: CoverageResult | null = null;
  if (first && firstStatements) {
    const mid = Math.floor(first.body.length / 2);
    const controlText = first.body.slice(
      Math.max(0, mid - BOUNDARY_WINDOW_CHARS),
      mid + BOUNDARY_WINDOW_CHARS,
    );
    control = await coverageOf({
      windowLabel: "control-mid-chunk",
      windowText: controlText,
      statements: firstStatements.map((s) => s.content),
    });
  }
  return { boundaries, control };
}

async function runSplitAbMode(llm: OpenAiProvider): Promise<unknown> {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is required for --split (judge)");
    process.exit(1);
  }
  const judge = createJudge(anthropicKey, JUDGE_CONCURRENCY);

  const abSeeds = LONG_INPUT_SEEDS.filter(
    (seed) => countTokens(seed.input) > EXTRACTION_CHUNK_THRESHOLD_TOKENS,
  );
  console.log(
    `분할 A/B — 임계선 초과 ${abSeeds.length}급간 × (1콜 vs 분할) × ${RUNS_PER_SEED}회 + 상한 합성 입력`,
  );

  const seedResults = [];
  for (const seed of abSeeds) {
    const chunks = chunkForExtraction(seed.input);

    // 지연 측정의 정확성을 위해 런은 순차로 — 런 내부(청크)만 병렬
    const singleRuns: CurveRun[] = [];
    for (let i = 0; i < RUNS_PER_SEED; i++) {
      singleRuns.push(
        await measureSingleRun({ llm, body: seed.input, runIndex: i }),
      );
    }
    const splitRuns: SplitRun[] = [];
    for (let i = 0; i < RUNS_PER_SEED; i++) {
      splitRuns.push(await measureSplitRun({ llm, chunks, runIndex: i }));
    }

    console.log(
      `${seed.id} — 1콜 ${singleRuns.map((r) => (r.latencyMs / 1000).toFixed(0) + "s").join("/")}` +
        ` vs 분할(${chunks.length}청크) ${splitRuns.map((r) => (r.wallMs / 1000).toFixed(0) + "s").join("/")}` +
        ` · 진술 ${singleRuns.map((r) => r.statementCount ?? "-").join("/")} vs ${splitRuns.map((r) => r.statements?.length ?? "-").join("/")}`,
    );
    for (const run of [...singleRuns, ...splitRuns]) {
      if (run.error) {
        console.log(`  ⚠ run${run.runIndex} 오류: ${run.error}`);
      }
    }

    const [singleConsistency, splitConsistency] = await Promise.all([
      consistencyOfRuns(
        judge,
        singleRuns.map((r) => r.statements),
      ),
      consistencyOfRuns(
        judge,
        splitRuns.map((r) => r.statements),
      ),
    ]);

    const firstSingle = singleRuns.find((r) => r.statements)?.statements ?? [];
    const firstSplit = splitRuns.find((r) => r.statements);
    const [singleQuality, splitQuality] = await Promise.all([
      qualityPassRates({ judge, source: seed.input, statements: firstSingle }),
      qualityPassRates({
        judge,
        source: seed.input,
        statements: firstSplit?.statements ?? [],
      }),
    ]);

    let coverage = null;
    let coverageError: string | null = null;
    if (firstSplit?.statementsPerChunk) {
      // run1의 청크별 진술 복원 — 연결본을 청크 경계 수로 다시 가른다
      const perChunk: ExtractedStatement[][] = [];
      let cursor = 0;
      for (const count of firstSplit.statementsPerChunk) {
        perChunk.push(
          (firstSplit.statements ?? []).slice(cursor, cursor + count),
        );
        cursor += count;
      }
      try {
        coverage = await boundaryCoverage({
          judge,
          chunks,
          statementsPerChunk: perChunk,
        });
      } catch (err) {
        // 포괄성은 부가 측정 — 심판 실패가 A/B 본 측정까지 유실시키지 않게 격리
        coverageError = describeError(err);
        console.log(`  ⚠ 경계 포괄성 측정 실패: ${coverageError}`);
      }
    }

    const mean = (xs: number[]) =>
      xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
    const judgeFailures =
      singleQuality.judgeFailures + splitQuality.judgeFailures;
    console.log(
      `  일관성 1콜 ${mean(singleConsistency)?.toFixed(3)} vs 분할 ${mean(splitConsistency)?.toFixed(3)}` +
        ` · 품질(원자/자기완결/충실, 표본 ${QUALITY_SAMPLE_PER_LIST}) 1콜 ${Object.values(
          singleQuality.rates,
        )
          .map((v) => (v * 100).toFixed(0))
          .join("/")}% vs 분할 ${Object.values(splitQuality.rates)
          .map((v) => (v * 100).toFixed(0))
          .join("/")}%` +
        (judgeFailures > 0 ? ` (판정 실패 ${judgeFailures} 제외)` : "") +
        (coverage
          ? ` · 경계 포괄 ${coverage.boundaries.map((b) => `${b.covered}/${b.elementCount}`).join(" ")} (대조 ${coverage.control?.covered}/${coverage.control?.elementCount})`
          : ""),
    );

    seedResults.push({
      seedId: seed.id,
      inputTokens: countTokens(seed.input),
      chunkCount: chunks.length,
      singleRuns,
      splitRuns,
      consistency: { single: singleConsistency, split: splitConsistency },
      quality: { single: singleQuality, split: splitQuality },
      coverage,
      coverageError,
    });
  }

  // 상한 합성 입력 — 다청크 구조 검증 (절단 품질은 급간별 측정의 몫)
  const upperBody = buildUpperBoundInput();
  const upperChunks = chunkForExtraction(upperBody);
  const upperRun = await measureSplitRun({
    llm,
    chunks: upperChunks,
    runIndex: 0,
  });
  console.log(
    `상한 합성(${countTokens(upperBody)} tok) — ${upperChunks.length}청크, ` +
      `벽시계 ${(upperRun.wallMs / 1000).toFixed(0)}초, 진술 ${upperRun.statements?.length ?? "-"}개` +
      (upperRun.error ? ` · 오류 ${upperRun.error}` : ""),
  );

  console.log(`심판 사용량: ${JSON.stringify(judge.usage())}`);
  return {
    seeds: seedResults,
    upperBound: {
      inputTokens: countTokens(upperBody),
      run: upperRun,
    },
    judgeUsage: judge.usage(),
  };
}

// --- 진입점 ---

async function main() {
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (!openaiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }
  const mode: Mode = process.argv.includes("--split") ? "split-ab" : "curve";

  const llm = new OpenAiProvider({
    apiKey: openaiKey,
    model: DEFAULT_STANDARD_MODEL,
  });

  console.log(
    `${mode === "curve" ? "길이 곡선" : "분할 A/B"} 측정 — ` +
      `모델 ${DEFAULT_STANDARD_MODEL} (effort ${EXTRACTION_EFFORT}), ` +
      `측정 타임아웃 ${CURVE_TIMEOUT_MS / 1000}초 (제품선 ${PRODUCT_TIMEOUT_MS / 1000}초)`,
  );

  const result =
    mode === "curve" ? await runCurveMode(llm) : await runSplitAbMode(llm);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(
    __dirname,
    `results-length-${mode}-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        mode,
        model: DEFAULT_STANDARD_MODEL,
        effort: EXTRACTION_EFFORT,
        curveTimeoutMs: CURVE_TIMEOUT_MS,
        productTimeoutMs: PRODUCT_TIMEOUT_MS,
        runsPerSeed: RUNS_PER_SEED,
        result,
      },
      null,
      2,
    ),
  );
  console.log(`\n결과 저장: ${outPath}`);
}

void main();
