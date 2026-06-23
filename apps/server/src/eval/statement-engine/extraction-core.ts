// 추출 측정의 공유 코어 — 추출 1콜·greedy 매칭·쌍대 일관성.
// run-extraction.ts(골든 대조)와 run-extraction-consistency.ts(실데이터 일관성)가 함께 쓴다.
// 측정 대상 = 제품과 동일한 추출 1콜(`prompts/statement-extraction.ts`)·동일 설정(worker 미러).

import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  EXTRACTION_EFFORT,
  EXTRACTION_TIMEOUT_MS as WORKER_EXTRACTION_TIMEOUT_MS,
} from "@server/infra/statement-sync/worker";
import {
  buildStatementExtractionMessage,
  type ExtractedStatement,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import { createLimiter, type Judge } from "./judge";
import { round, scoreF1 } from "./metrics";

export type StatementType = ExtractedStatement["type"];
export type Confidence = "certain" | "guess" | null;

export interface NormalizedStatement {
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

// 글×반복 전부를 동시에 쏘면 제공자 타임아웃을 넘긴다 — 상한 필수
const EXTRACTION_CONCURRENCY = 4;
const EXTRACTION_MAX_ATTEMPTS = 3;
const EXTRACTION_RETRY_DELAY_MS = 3_000;

const limitExtraction = createLimiter(EXTRACTION_CONCURRENCY);

export async function extract(
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
          effort: EXTRACTION_EFFORT,
          timeoutMs: WORKER_EXTRACTION_TIMEOUT_MS,
          maxRetries: 0,
        }),
      );
      return normalize(output.statements);
    } catch (error) {
      lastError = error;
      console.warn(
        `  추출 재시도 ${attempt + 1}/${EXTRACTION_MAX_ATTEMPTS}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // rate limit에서 즉시 재시도는 악화 — 선형 백오프
      await new Promise((resolve) =>
        setTimeout(resolve, EXTRACTION_RETRY_DELAY_MS * (attempt + 1)),
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
export async function matchStatements<L, R>(
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

interface Consistency {
  pairwiseF1: number[];
  mean: number | null;
}

// 같은 입력 N회 추출의 모든 쌍(N개 중 2개)에 대한 쌍대 F1 (eval-design 3.3).
// 쌍은 서로 독립이라 동시 처리. 두 run이 모두 비면 1(완전 일치).
export async function computePairwiseConsistency(
  runs: NormalizedStatement[][],
  judge: Judge,
): Promise<Consistency> {
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
  const mean =
    pairwiseF1.length === 0
      ? null
      : pairwiseF1.reduce((sum, value) => sum + value, 0) / pairwiseF1.length;
  return {
    pairwiseF1: pairwiseF1.map(round),
    mean: mean === null ? null : round(mean),
  };
}
