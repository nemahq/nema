// 관계 후보 좁히기 ⓐ 측정 러너 (relation-design §4·§11, NEM-165) — 후보 K·점수 하한 보정.
//
// 실행: docker run -d -p 6333:6333 qdrant/qdrant 기동 후
//   apps/server에서  pnpm tsx src/eval/relation-engine/run-candidate-retrieval.ts
// 필요 키: VOYAGE_API_KEY — loadEnv가 읽는다.
//
// 프로덕션 투입 순서(A→B→C→D)를 재현한다: 글을 적재한 뒤 그 글 진술로 이웃을 검색해야
// 질의 시점에 앞 글들만 코퍼스에 있는 실제 상황이 잡힌다. searchNeighbors는 저장된 벡터로
// 검색하므로(재임베딩 없음 — 제품과 동일) 질의 진술이 먼저 적재돼 있어야 한다.
// 점수 분포 전체를 한 번 떠두고, K·하한 스윕은 후처리로 한다(재질의 없이 곡선을 뽑는다).

process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";
process.env["QDRANT_COLLECTION"] ??= "relations_retrieval_eval";
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "@server/env";
import { pointIdOf, round } from "@server/eval/statement-engine/metrics";
import { createVoyageProvider } from "@server/infra/embedding";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";

import {
  RETRIEVAL_ARTICLES,
  RETRIEVAL_CORPUS,
  RETRIEVAL_GOLD_PAIRS,
  RETRIEVAL_TRAP_PAIRS,
} from "./retrieval-seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const EVAL_SPACE_ID = "00000000-0000-4000-8000-0000000000e7";
/** 점수 분포를 전부 받는다 (코퍼스보다 큰 한도 + 컷 없는 하한) — 스윕은 후처리 */
const FULL_LIMIT = RETRIEVAL_CORPUS.length;
const NO_THRESHOLD = -1;
/** 프로덕션 값 — 베이스라인 표식 (worker.ts와 일치시킨다) */
const PROD_K = 7;
const PROD_THRESHOLD = 0.5;
/** 스윕 격자 */
const SWEEP_K = [5, 6, 7, 8, 10, 15, 20];
const SWEEP_THRESHOLD = [0.3, 0.4, 0.5, 0.6, 0.7];
/** 글마다 createdAt을 하루씩 띄워 투입 순서를 명시 (값 자체는 순서만 의미) */
const MS_PER_DAY = 86_400_000;
/** 충돌 쌍 상세에 곁들이는 상위 이웃 미리보기 개수 */
const TOP_NEIGHBORS_PREVIEW = 5;

interface Neighbor {
  id: string;
  score: number;
}

/** 한 질의 진술의 이웃 — 자기 제외, 점수 내림차순. 후처리에서 하한·K·형제 제외를 적용한다. */
type NeighborIndex = Map<string, Neighbor[]>;

function articleOf(id: string): string {
  return RETRIEVAL_CORPUS.find((s) => s.id === id)?.article ?? "?";
}

/** (K, 하한)에서 한 질의가 LLM 판정에 넘기는 후보 = 하한 통과 상위 K개 중 형제 제외 (worker 순서 그대로) */
function candidatesAt(params: {
  neighbors: Neighbor[];
  queryArticle: string;
  k: number;
  threshold: number;
}): string[] {
  const { neighbors, queryArticle, k, threshold } = params;
  return neighbors
    .filter((n) => n.score >= threshold)
    .slice(0, k)
    .filter((n) => articleOf(n.id) !== queryArticle)
    .map((n) => n.id);
}

async function buildNeighborIndex(): Promise<NeighborIndex> {
  const voyageKey = process.env["VOYAGE_API_KEY"]?.trim();
  if (!voyageKey) {
    console.error("VOYAGE_API_KEY is required");
    process.exit(1);
  }

  const collection =
    process.env["QDRANT_COLLECTION"] ?? "relations_retrieval_eval";
  const provider = createVoyageProvider({ apiKey: voyageKey });
  const client = createQdrantClient();
  const store = createQdrantStore(client);

  // 매 실행 깨끗한 코퍼스 — 잔존 벡터가 측정을 조용히 오염시키지 않게
  const { exists } = await client.collectionExists(collection);
  if (exists) {
    await client.deleteCollection(collection);
  }
  await store.ensureCollection();

  const pointToId = new Map(
    RETRIEVAL_CORPUS.map((s) => [pointIdOf(s.id), s.id]),
  );
  const index: NeighborIndex = new Map();
  const baseTime = Date.parse("2026-01-01T00:00:00.000Z");

  // 투입 순서 재현 — 글 적재 → 그 글 진술로 검색(앞 글들만 보임) → 다음 글
  let articleIndex = 0;
  for (const article of RETRIEVAL_ARTICLES) {
    const statements = RETRIEVAL_CORPUS.filter((s) => s.article === article);
    await store.upsertStatements(
      provider,
      statements.map((s, i) => ({
        statementId: pointIdOf(s.id),
        spaceId: EVAL_SPACE_ID,
        content: s.content,
        type: s.type,
        confidence: s.confidence,
        createdAt: new Date(
          baseTime + articleIndex * MS_PER_DAY + i,
        ).toISOString(),
      })),
    );

    for (const statement of statements) {
      const hits = await store.searchNeighbors({
        statementId: pointIdOf(statement.id),
        spaceId: EVAL_SPACE_ID,
        limit: FULL_LIMIT,
        scoreThreshold: NO_THRESHOLD,
      });
      index.set(
        statement.id,
        hits.map((h) => ({
          id: pointToId.get(h.statementId) ?? h.statementId,
          score: round(h.score),
        })),
      );
    }
    articleIndex += 1;
  }

  return index;
}

interface CellResult {
  k: number;
  threshold: number;
  goldRecall: number;
  conflictRetrieved: boolean;
  trapsSurfaced: number;
  totalCandidatePairs: number;
}

function evaluateCell(params: {
  index: NeighborIndex;
  k: number;
  threshold: number;
}): CellResult {
  const { index, k, threshold } = params;
  const candidateSet = (queryId: string): Set<string> => {
    const neighbors = index.get(queryId) ?? [];
    return new Set(
      candidatesAt({
        neighbors,
        queryArticle: articleOf(queryId),
        k,
        threshold,
      }),
    );
  };

  let goldHit = 0;
  let conflictRetrieved = false;
  for (const pair of RETRIEVAL_GOLD_PAIRS) {
    const retrieved = candidateSet(pair.newer).has(pair.older);
    if (retrieved) {
      goldHit += 1;
    }
    if (pair.kind === "conflicts") {
      conflictRetrieved = retrieved;
    }
  }

  let trapsSurfaced = 0;
  for (const trap of RETRIEVAL_TRAP_PAIRS) {
    if (candidateSet(trap.newer).has(trap.older)) {
      trapsSurfaced += 1;
    }
  }

  // 판정에 넘어가는 총 cross-article 후보 쌍 수 — 거짓 supports의 표면적(클수록 위험·비용↑)
  let totalCandidatePairs = 0;
  for (const statement of RETRIEVAL_CORPUS) {
    totalCandidatePairs += candidateSet(statement.id).size;
  }

  return {
    k,
    threshold,
    goldRecall: round(goldHit / RETRIEVAL_GOLD_PAIRS.length),
    conflictRetrieved,
    trapsSurfaced,
    totalCandidatePairs,
  };
}

async function main() {
  const index = await buildNeighborIndex();

  // 충돌 쌍이 얼마나 먼지 — §11의 핵심 질문
  const conflictPair = RETRIEVAL_GOLD_PAIRS.find((p) => p.kind === "conflicts");
  const conflictNeighbors = conflictPair
    ? (index.get(conflictPair.newer) ?? [])
    : [];
  const conflictRank = conflictPair
    ? conflictNeighbors.findIndex((n) => n.id === conflictPair.older)
    : -1;
  const conflictDetail = conflictPair
    ? {
        pair: `${conflictPair.older} → ${conflictPair.newer}`,
        rankAmongNeighbors: conflictRank === -1 ? null : conflictRank + 1,
        score:
          conflictRank === -1 ? null : conflictNeighbors[conflictRank]?.score,
        topNeighbors: conflictNeighbors.slice(0, TOP_NEIGHBORS_PREVIEW),
      }
    : null;

  const baseline = evaluateCell({
    index,
    k: PROD_K,
    threshold: PROD_THRESHOLD,
  });
  const sweep = SWEEP_K.flatMap((k) =>
    SWEEP_THRESHOLD.map((t) => evaluateCell({ index, k, threshold: t })),
  );

  // 골든 쌍별 이웃 내 순위·점수 — 어떤 쌍이 약한지 한눈에
  const pairDetail = RETRIEVAL_GOLD_PAIRS.map((pair) => {
    const neighbors = index.get(pair.newer) ?? [];
    const rank = neighbors.findIndex((n) => n.id === pair.older);
    return {
      pair: `${pair.older} → ${pair.newer}`,
      kind: pair.kind,
      rankAmongNeighbors: rank === -1 ? null : rank + 1,
      score: rank === -1 ? null : neighbors[rank]?.score,
    };
  });

  // 함정 쌍이 질의의 이웃 목록 몇 위에 있나 — 어느 K부터 거짓 supports 먹이로 새는지
  const trapDetail = RETRIEVAL_TRAP_PAIRS.map((trap) => {
    const neighbors = index.get(trap.newer) ?? [];
    const rank = neighbors.findIndex((n) => n.id === trap.older);
    return {
      pair: `${trap.older} → ${trap.newer}`,
      note: trap.note,
      rankAmongNeighbors: rank === -1 ? null : rank + 1,
      score: rank === -1 ? null : neighbors[rank]?.score,
    };
  });

  const result = {
    runAt: new Date().toISOString(),
    corpusSize: RETRIEVAL_CORPUS.length,
    prodKnobs: { k: PROD_K, threshold: PROD_THRESHOLD },
    baseline,
    conflictDetail,
    pairDetail,
    trapDetail,
    sweep,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-candidate-retrieval-${timestamp}.json`,
  );
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log("\n=== 골든 쌍별 이웃 순위·점수 (질의 진술의 이웃 목록 내) ===");
  for (const d of pairDetail) {
    console.log(
      `  [${d.kind}] ${d.pair} — 순위 ${d.rankAmongNeighbors ?? "없음"}, 점수 ${d.score ?? "-"}`,
    );
  }
  console.log("\n=== 함정 쌍 이웃 순위 (거짓 supports 먹이) ===");
  for (const t of trapDetail) {
    console.log(
      `  ${t.pair} — 순위 ${t.rankAmongNeighbors ?? "없음"}, 점수 ${t.score ?? "-"}  (${t.note})`,
    );
  }
  console.log("\n=== 충돌 쌍 상세 (§11) ===");
  console.log(JSON.stringify(conflictDetail, null, 2));
  console.log(`\n=== 베이스라인 (K=${PROD_K}, 하한=${PROD_THRESHOLD}) ===`);
  console.log(JSON.stringify(baseline, null, 2));
  console.log("\n=== 스윕 (goldRecall / 충돌 / 함정 / 총후보) ===");
  for (const c of sweep) {
    console.log(
      `  K=${String(c.k).padStart(2)} 하한=${c.threshold} → recall ${c.goldRecall} 충돌 ${c.conflictRetrieved ? "✓" : "✗"} 함정 ${c.trapsSurfaced}/${RETRIEVAL_TRAP_PAIRS.length} 총후보 ${c.totalCandidatePairs}`,
    );
  }
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("eval run failed:", error);
  process.exit(1);
});
