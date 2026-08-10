// 검색 민감도 러너 — 골든을 뭉쳐(과소분할 모사) 검색 recall이 어디서 깨지나 (NEM-168 태스크 8).
//
// 실행: docker run -d -p 6333:6333 qdrant/qdrant 기동 후
//   apps/server에서  pnpm tsx src/eval/statement-engine/run-retrieval-degraded.ts
// 필요 키: VOYAGE_API_KEY — loadEnv가 읽는다.
//
// 왜: 추출 합격선(target)을 "현재 값"으로 잡으면 앵커링이다. 거꾸로, 추출을 일부러 깎으면
//   하류가 어디서 깨지나로 마지노선을 도출한다(§3 "아직 빈 것"). 여기선 입력측 깎기 = 뭉치기
//   (인접 골든 합침 = #312가 잰 쪼개기 경계 불안정)를 rate별로 부어 recall@k 곡선을 본다.
// 채점: 합친 진술은 원본 여럿을 덮으므로(커버리지), 질의 기대 원본 id가 top-k 안 어느 합성
//   진술에 덮이면 recall 적중. rate가 오르면 임베딩이 희석돼 적중이 떨어진다 — 그 하락이 신호.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";
process.env["QDRANT_COLLECTION"] ??= "statements_eval_degraded";
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createVoyageProvider } from "@server/infra/embedding";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";

import { mergeByBoundaryRemoval, type MergedGroup } from "./degrade";
import { pointIdOf, round } from "./metrics";
import {
  type GoldenStatement,
  SEED_DOCUMENTS,
  SEED_QUERIES,
} from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const RECALL_K = 5;
const SEARCH_LIMIT = 10;
const NO_THRESHOLD = -1;
const EVAL_SPACE_ID = "00000000-0000-4000-8000-0000000000e7";
// 뭉치기 비율 스윕 — 0=baseline(불변), 1=문서 전체 1진술. 곡선의 무너지는 지점이 target 단서.
const MERGE_RATES = [0, 0.25, 0.5, 0.75, 1] as const;

type Store = ReturnType<typeof createQdrantStore>;
type Provider = ReturnType<typeof createVoyageProvider>;

interface RateReport {
  rate: number;
  statementCount: number;
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  perQuery: Array<{ queryId: string; recall: number; firstHitRank: number }>;
}

async function measureRate(params: {
  store: Store;
  provider: Provider;
  collection: string;
  rate: number;
  client: ReturnType<typeof createQdrantClient>;
}): Promise<RateReport> {
  const { store, provider, collection, rate, client } = params;

  const groups = SEED_DOCUMENTS.flatMap(
    (doc) => mergeByBoundaryRemoval(doc.goldenStatements, rate).groups,
  );
  // 합성 진술 point id → 그것이 덮는 원본 골든 id들
  const pointToSources = new Map<string, string[]>(
    groups.map((group) => [pointIdOf(group.id), group.sourceIds]),
  );

  const { exists } = await client.collectionExists(collection);
  if (exists) {
    await client.deleteCollection(collection);
  }
  await store.ensureCollection();

  const uploadedAt = new Date().toISOString();
  await store.upsertStatements(
    provider,
    groups.map((group: MergedGroup<GoldenStatement>) => {
      const representative = group.members[0];
      return {
        statementId: pointIdOf(group.id),
        spaceId: EVAL_SPACE_ID,
        content: group.content,
        type: representative.type,
        confidence:
          representative.type === "claim" ? representative.confidence : null,
        createdAt: uploadedAt,
      };
    }),
  );

  const perQuery: RateReport["perQuery"] = [];
  let recallSum = 0;
  let precisionSum = 0;
  let rrSum = 0;
  let answerable = 0;

  for (const seedQuery of SEED_QUERIES) {
    const expected = new Set(seedQuery.expectedStatementIds);
    if (expected.size === 0) {
      continue;
    }
    answerable += 1;

    const hits = await store.search(provider, {
      spaceIds: [EVAL_SPACE_ID],
      query: seedQuery.query,
      limit: SEARCH_LIMIT,
      scoreThreshold: NO_THRESHOLD,
    });
    const topK = hits.slice(0, RECALL_K);

    const covered = new Set<string>();
    let relevantPoints = 0;
    for (const hit of topK) {
      const sources = pointToSources.get(hit.statementId) ?? [];
      const hitsExpected = sources.filter((id) => expected.has(id));
      if (hitsExpected.length > 0) {
        relevantPoints += 1;
      }
      for (const id of hitsExpected) {
        covered.add(id);
      }
    }
    const recall = covered.size / expected.size;
    const precision = topK.length > 0 ? relevantPoints / topK.length : 0;

    const firstHitRank = hits.findIndex((hit) =>
      (pointToSources.get(hit.statementId) ?? []).some((id) =>
        expected.has(id),
      ),
    );
    const rr = firstHitRank === -1 ? 0 : 1 / (firstHitRank + 1);

    recallSum += recall;
    precisionSum += precision;
    rrSum += rr;
    perQuery.push({
      queryId: seedQuery.id,
      recall: round(recall),
      firstHitRank,
    });
  }

  return {
    rate,
    statementCount: groups.length,
    recallAtK: round(recallSum / answerable),
    precisionAtK: round(precisionSum / answerable),
    mrr: round(rrSum / answerable),
    perQuery,
  };
}

async function main() {
  const voyageKey = process.env["VOYAGE_API_KEY"]?.trim();
  if (!voyageKey) {
    console.error("VOYAGE_API_KEY is required");
    process.exit(1);
  }

  const collection =
    process.env["QDRANT_COLLECTION"] ?? "statements_eval_degraded";
  const provider = createVoyageProvider({ apiKey: voyageKey });
  const client = createQdrantClient();
  const store = createQdrantStore(client);

  console.log(
    `뭉치기 민감도 — 골든 ${SEED_DOCUMENTS.flatMap((d) => d.goldenStatements).length}개, rate ${MERGE_RATES.join("/")} (${collection})`,
  );

  const reports: RateReport[] = [];
  for (const rate of MERGE_RATES) {
    const report = await measureRate({
      store,
      provider,
      collection,
      rate,
      client,
    });
    reports.push(report);
    console.log(
      `  rate ${rate}: 진술 ${report.statementCount} · recall@${RECALL_K} ${report.recallAtK} · precision ${report.precisionAtK} · MRR ${report.mrr}`,
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-retrieval-degraded-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      { runAt: new Date().toISOString(), recallK: RECALL_K, reports },
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
