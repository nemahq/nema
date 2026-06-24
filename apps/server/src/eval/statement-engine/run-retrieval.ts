// 검색 러너 (eval-design 5장) — recall@5 + MRR + 점수 분포
//
// 실행: docker run -d -p 6333:6333 qdrant/qdrant 기동 후
//   apps/server에서  pnpm tsx src/eval/statement-engine/run-retrieval.ts
// 필요 키: VOYAGE_API_KEY — loadEnv가 읽는다.
//
// 코퍼스 = 골든 진술 직접 임베딩(결정 #1) — 추출 엔진과 무관하게 검색만 격리 측정.
// 평가 전용 컬렉션을 매 실행 비우고 다시 채운다(제품 컬렉션 불간섭).

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// dotenv는 이미 설정된 process.env를 덮지 않는다 — loadEnv 전에 선점해
// 운영 env(.env.staging) 값보다 로컬 평가 기본값이 이기게 한다
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";
process.env["QDRANT_COLLECTION"] ??= "statements_eval";
// 이 러너는 Supabase를 쓰지 않는다 — env 스키마(필수 키) 통과용 자리값
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createVoyageProvider } from "@server/infra/embedding";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";

import { pointIdOf, round } from "./metrics";
import { SEED_DOCUMENTS, SEED_QUERIES, type SeedQuery } from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

/** recall을 재는 컷 (eval-design 5장) */
const RECALL_K = 5;
/** 점수 분포 관찰용으로 컷보다 넉넉히 가져온다 */
const SEARCH_LIMIT = 10;
/** threshold 보정이 목적이라 컷 없이 전부 받는다 (cosine 최저값) */
const NO_THRESHOLD = -1;
/** 평가 전용 Space — 격리 필터 경로(spaceIds)를 실전과 동일하게 태운다 */
const EVAL_SPACE_ID = "00000000-0000-4000-8000-0000000000e7";
/** 무정답 질의에서 기록하는 상위 점수 개수 (threshold 보정의 반대쪽 재료) */
const NO_ANSWER_TOP_SCORES = 3;

interface QueryReport {
  queryId: string;
  query: string;
  failureAxis: SeedQuery["failureAxis"];
  expected: string[];
  /** 순위대로 — 골든 id·점수·기대 정답 여부 */
  results: Array<{ goldenId: string; score: number; isExpected: boolean }>;
  recallAtK: number | null;
  precisionAtK: number | null;
  reciprocalRank: number | null;
}

async function main() {
  const voyageKey = process.env["VOYAGE_API_KEY"]?.trim();
  if (!voyageKey) {
    console.error("VOYAGE_API_KEY is required");
    process.exit(1);
  }

  const collection = process.env["QDRANT_COLLECTION"] ?? "statements_eval";
  const provider = createVoyageProvider({ apiKey: voyageKey });
  const client = createQdrantClient();
  const store = createQdrantStore(client);

  // 매 실행 깨끗한 코퍼스 — 골든이 자라도 잔존 벡터가 없게.
  // 존재 확인 후 삭제 — 에러를 삼키면 삭제 실패 시 오염된 코퍼스로 조용히 측정된다.
  const { exists } = await client.collectionExists(collection);
  if (exists) {
    await client.deleteCollection(collection);
  }
  await store.ensureCollection();

  const golden = SEED_DOCUMENTS.flatMap((doc) => doc.goldenStatements);
  const pointToGolden = new Map(golden.map((g) => [pointIdOf(g.id), g.id]));
  const uploadedAt = new Date().toISOString();

  console.log(`골든 진술 ${golden.length}개 임베딩·적재 중 (${collection})...`);
  await store.upsertStatements(
    provider,
    golden.map((g) => ({
      statementId: pointIdOf(g.id),
      spaceId: EVAL_SPACE_ID,
      content: g.content,
      type: g.type,
      confidence: g.type === "claim" ? g.confidence : null,
      createdAt: uploadedAt,
    })),
  );

  const reports: QueryReport[] = [];
  for (const seedQuery of SEED_QUERIES) {
    const hits = await store.search(provider, {
      spaceIds: [EVAL_SPACE_ID],
      query: seedQuery.query,
      limit: SEARCH_LIMIT,
      scoreThreshold: NO_THRESHOLD,
    });

    const expected = new Set(seedQuery.expectedStatementIds);
    const results = hits.map((hit) => {
      const goldenId = pointToGolden.get(hit.statementId) ?? hit.statementId;
      return {
        goldenId,
        score: round(hit.score),
        isExpected: expected.has(goldenId),
      };
    });

    // no-answer 질의는 지표에서 제외하고 점수만 기록 (eval-design 5장)
    const isAnswerable = expected.size > 0;
    const topK = results.slice(0, RECALL_K);
    const relevantInTopK = topK.filter((r) => r.isExpected).length;
    const recallAtK = isAnswerable ? relevantInTopK / expected.size : null;
    // Precision@k — 건진 top-k 중 맞은 비율(잡음 신호). 분모는 top-k 실건수(보통 k)라
    // threshold 무관한 순위 품질이다. 정답이 k보다 적은 질의는 상한 |expected|/k에 묶인다.
    const precisionAtK =
      isAnswerable && topK.length > 0 ? relevantInTopK / topK.length : null;
    const firstHitRank = results.findIndex((r) => r.isExpected);
    let reciprocalRank: number | null = null;
    if (isAnswerable) {
      reciprocalRank = firstHitRank === -1 ? 0 : 1 / (firstHitRank + 1);
    }

    reports.push({
      queryId: seedQuery.id,
      query: seedQuery.query,
      failureAxis: seedQuery.failureAxis,
      expected: seedQuery.expectedStatementIds,
      results,
      recallAtK: recallAtK === null ? null : round(recallAtK),
      precisionAtK: precisionAtK === null ? null : round(precisionAtK),
      reciprocalRank: reciprocalRank === null ? null : round(reciprocalRank),
    });

    let marker = "·";
    if (recallAtK !== null) {
      if (recallAtK === 1) {
        marker = "✓";
      } else if (recallAtK > 0) {
        marker = "△";
      } else {
        marker = "✗";
      }
    }
    console.log(
      `${marker} [${seedQuery.id}] ${seedQuery.query} — top1 ${results[0]?.goldenId ?? "(없음)"} (${results[0]?.score ?? "-"})`,
    );
  }

  const answerable = reports.filter((r) => r.recallAtK !== null);
  const summary = {
    recallAtK: round(
      answerable.reduce((sum, r) => sum + (r.recallAtK ?? 0), 0) /
        answerable.length,
    ),
    precisionAtK: round(
      answerable.reduce((sum, r) => sum + (r.precisionAtK ?? 0), 0) /
        answerable.length,
    ),
    mrr: round(
      answerable.reduce((sum, r) => sum + (r.reciprocalRank ?? 0), 0) /
        answerable.length,
    ),
    byAxis: Object.fromEntries(
      [...new Set(answerable.map((r) => r.failureAxis))].map((axis) => {
        const axisReports = answerable.filter((r) => r.failureAxis === axis);
        return [
          axis,
          {
            queries: axisReports.length,
            recallAtK: round(
              axisReports.reduce((sum, r) => sum + (r.recallAtK ?? 0), 0) /
                axisReports.length,
            ),
            precisionAtK: round(
              axisReports.reduce((sum, r) => sum + (r.precisionAtK ?? 0), 0) /
                axisReports.length,
            ),
            mrr: round(
              axisReports.reduce((sum, r) => sum + (r.reciprocalRank ?? 0), 0) /
                axisReports.length,
            ),
          },
        ];
      }),
    ),
    // threshold 보정 재료 — 정답의 점수대 vs 무정답 질의 상위 점수대
    scoreDistribution: {
      expectedHitScores: answerable
        .flatMap((r) =>
          r.results.filter((x) => x.isExpected).map((x) => x.score),
        )
        .sort((a, b) => b - a),
      noAnswerTopScores: reports
        .filter((r) => r.recallAtK === null)
        .map((r) => ({
          queryId: r.queryId,
          topScores: r.results
            .slice(0, NO_ANSWER_TOP_SCORES)
            .map((x) => x.score),
        })),
    },
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(__dirname, `results-retrieval-${timestamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        embeddingModel: provider.model,
        recallK: RECALL_K,
        corpusSize: golden.length,
        summary,
        queries: reports,
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
