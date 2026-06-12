// 길이별 추출 곡선 러너 — 초장문 분할 필요성의 관문 측정
//
// 실행: apps/server에서  pnpm tsx src/eval/statement-engine/run-length-curve.ts
// 필요 키: OPENAI_API_KEY — loadEnv가 읽는다. 심판·Supabase·Qdrant 불필요.
//
// "초장문은 1콜이 못 받는다"는 아직 가설이다(기존 측정은 전부 ~200토큰 이하).
// 장문 시드 4급간을 분할 없는 현행 1콜(제품과 동일: gpt-5 + reasoning low)에
// 넣어 길이별 지연·진술 수를 실측한다. 타임아웃은 제품선(EXTRACTION_TIMEOUT_MS)보다
// 길게 풀어 "잘렸다"가 아니라 "실제 몇 초 걸렸다"를 곡선에 남긴다.
//
// 곡선이 말해주는 것:
// - 제품 타임아웃을 넘기 시작하는 길이 → 분할 임계선의 역산 재료
// - 반복 간 진술 수 분산 → 긴 맥락에서 절단 일관성이 흔들리는 1차 신호
// - 안 무너지면 → 분할 자체가 불필요(가설 기각), 더 긴 급간으로 재측정

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getEncoding } from "js-tiktoken";

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마(필수 키·쌍 제약) 통과용 자리값.
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { LlmError } from "@server/infra/llm/llm-error";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  EXTRACTION_REASONING_EFFORT,
  EXTRACTION_TIMEOUT_MS as PRODUCT_TIMEOUT_MS,
} from "@server/infra/statement-sync/worker";
import {
  buildStatementExtractionMessage,
  type ExtractedStatement,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import { createLimiter } from "./judge";
import { LONG_INPUT_SEEDS } from "./long-input-seeds";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

/** 급간당 반복 — 지연의 변동폭과 진술 수 분산을 보려면 1회로는 부족 */
const RUNS_PER_SEED = 3;
/** 동시 호출 상한 — 곡선은 지연 측정이라 과한 동시성은 측정 자체를 오염시킨다 */
const CONCURRENCY = 3;
/** 제품선보다 길게 풀어 실제 소요를 본다 — 곡선의 목적은 통과/실패가 아니라 모양 */
const CURVE_TIMEOUT_MS = 180_000;
/** 콘솔 요약의 칼럼 폭 (시드 id / 토큰 수) */
const SEED_ID_COL_WIDTH = 24;
const TOKEN_COL_WIDTH = 5;

interface CurveRun {
  runIndex: number;
  latencyMs: number;
  statementCount: number | null;
  /** 제품 타임아웃(60초) 기준이었다면 잘렸을 호출 */
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

async function measureRun(params: {
  llm: OpenAiProvider;
  body: string;
  runIndex: number;
}): Promise<CurveRun> {
  const { llm, body, runIndex } = params;
  const startedAt = Date.now();
  try {
    const output = await llm.generateStructured({
      schema: StatementExtractionSchema,
      schemaName: "statement_extraction",
      systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildStatementExtractionMessage(body) },
      ],
      reasoningEffort: EXTRACTION_REASONING_EFFORT,
      timeoutMs: CURVE_TIMEOUT_MS,
      // SDK 묵시 재시도(기본 2회)가 끼면 합산 시간이 단일 콜 지연으로 기록돼
      // 곡선이 오염된다 — 워커와 동일하게 끈다
      maxRetries: 0,
    });
    const latencyMs = Date.now() - startedAt;
    return {
      runIndex,
      latencyMs,
      statementCount: output.statements.length,
      exceedsProductTimeout: latencyMs > PRODUCT_TIMEOUT_MS,
      error: null,
      statements: output.statements,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    // 분류 코드(timeout/rate_limit/…)를 함께 남긴다 — 사후 집계가 message 문자열에 안 기대게
    let error: string;
    if (err instanceof LlmError) {
      error = `[${err.code}] ${err.message}`;
    } else {
      error = err instanceof Error ? err.message : String(err);
    }
    return {
      runIndex,
      latencyMs,
      statementCount: null,
      exceedsProductTimeout: latencyMs > PRODUCT_TIMEOUT_MS,
      error,
      statements: null,
    };
  }
}

function summarize(point: CurvePoint): string {
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
    over > 0 ? `60초 초과 ${over}/${point.runs.length}` : "60초 이내",
    errors > 0 ? `오류 ${errors}` : "",
  ]
    .filter(Boolean)
    .join("  ");
}

async function main() {
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (!openaiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const llm = new OpenAiProvider({
    apiKey: openaiKey,
    model: DEFAULT_STANDARD_MODEL,
  });
  const limit = createLimiter(CONCURRENCY);
  const encoder = getEncoding("o200k_base");

  console.log(
    `길이 곡선 측정 — ${LONG_INPUT_SEEDS.length}급간 × ${RUNS_PER_SEED}회, ` +
      `모델 ${DEFAULT_STANDARD_MODEL} (effort ${EXTRACTION_REASONING_EFFORT}), ` +
      `측정 타임아웃 ${CURVE_TIMEOUT_MS / 1000}초 (제품선 ${PRODUCT_TIMEOUT_MS / 1000}초)`,
  );

  const points: CurvePoint[] = await Promise.all(
    LONG_INPUT_SEEDS.map(async (seed) => {
      const runs = await Promise.all(
        Array.from({ length: RUNS_PER_SEED }, (_, runIndex) =>
          limit(() => measureRun({ llm, body: seed.input, runIndex })),
        ),
      );
      const point: CurvePoint = {
        seedId: seed.id,
        description: seed.description,
        inputTokens: encoder.encode(seed.input).length,
        inputChars: seed.input.length,
        runs,
      };
      console.log(summarize(point));
      return point;
    }),
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(__dirname, `results-length-curve-${timestamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        model: DEFAULT_STANDARD_MODEL,
        reasoningEffort: EXTRACTION_REASONING_EFFORT,
        curveTimeoutMs: CURVE_TIMEOUT_MS,
        productTimeoutMs: PRODUCT_TIMEOUT_MS,
        runsPerSeed: RUNS_PER_SEED,
        points,
      },
      null,
      2,
    ),
  );
  console.log(`\n결과 저장: ${outPath}`);
}

void main();
