// 검색 난도 ↑ 러너 — tiro 실데이터 진술을 distractor로 부어 빽빽한 코퍼스에서 recall 재측정.
//
// 배경: 기본 검색 eval은 골든 39개만 코퍼스로 써서 경쟁자가 적다(recall 0.978은 "쉬운 시험").
// 실제 사용은 수천 진술이 경쟁한다 — 그 밀도를 흉내내 "0.978이 빽빽함 속에서도 버티나"를 본다.
//
// 실행: docker run -d -p 6333:6333 qdrant/qdrant 후
//   pnpm tsx src/eval/statement-engine/run-retrieval-dense.ts [노트수=80]
// 데이터: .local/tiro-samples (TIRO_DIR로 교체). 요약(summary.md)을 추출 입력으로 쓴다 —
//   원본 전사가 아니라 이미 깎인 맥락이라 엔진 설계 입력에 가깝고 비용도 싸다.
// recall은 골든 39개로만 채점한다 — distractor는 pointToGolden에 없어 자동으로 "오답 경쟁자".

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";
process.env["QDRANT_COLLECTION"] ??= "statements_eval_dense";
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import { createVoyageProvider } from "@server/infra/embedding";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  EXTRACTION_EFFORT,
  EXTRACTION_TIMEOUT_MS,
} from "@server/infra/statement-sync/worker";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";
import {
  buildStatementExtractionMessage,
  STATEMENT_EXTRACTION_SYSTEM_PROMPT,
  StatementExtractionSchema,
} from "@server/prompts/statement-extraction";

import { pointIdOf, round } from "./metrics";
import { SEED_DOCUMENTS, SEED_QUERIES } from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const RECALL_K = 5;
const SEARCH_LIMIT = 10;
const NO_THRESHOLD = -1;
const EVAL_SPACE_ID = "00000000-0000-4000-8000-0000000000e7";
const NO_ANSWER_TOP_SCORES = 3;
const DEFAULT_NOTE_COUNT = 80;
/** 요약 입력 상한 — 과대 입력으로 추출이 흔들리거나 비싸지지 않게 */
const SUMMARY_CHAR_CAP = 8_000;
/** 추출 동시 실행 수 — rate limit과 속도의 절충 */
const EXTRACT_CONCURRENCY = 5;
/** Voyage 한 번에 임베딩할 진술 수 */
const UPSERT_BATCH = 100;
/** 기준선(측정 #1·#8, sparse 코퍼스 39개) */
const SPARSE_RECALL_BASELINE = 0.978;

interface Distractor {
  id: string;
  content: string;
  type: "claim" | "question" | "todo";
  confidence: "certain" | "guess" | null;
}

async function extractStatements(
  llm: LlmProvider,
  body: string,
): Promise<Distractor[]> {
  const output = await llm.generateStructured({
    schema: StatementExtractionSchema,
    schemaName: "statement_extraction",
    systemPrompt: STATEMENT_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildStatementExtractionMessage(body) },
    ],
    effort: EXTRACTION_EFFORT,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    maxRetries: 1,
  });
  return output.statements.map((s, i) => ({
    id: `tiro-${i}`,
    content: s.content,
    type: s.type,
    confidence: s.type === "claim" ? s.confidence : null,
  }));
}

function loadStandaloneIds(tiroDir: string): string[] {
  const curation = JSON.parse(
    readFileSync(resolve(tiroDir, "curation.json"), "utf8"),
  ) as { standalone: string[] };
  return curation.standalone;
}

async function collectDistractors(args: {
  llm: LlmProvider;
  tiroDir: string;
  noteIds: string[];
}): Promise<Distractor[]> {
  const { llm, tiroDir, noteIds } = args;
  const all: Distractor[] = [];
  let done = 0;
  for (let i = 0; i < noteIds.length; i += EXTRACT_CONCURRENCY) {
    const batch = noteIds.slice(i, i + EXTRACT_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (noteId) => {
        const path = resolve(tiroDir, "notes", noteId, "summary.md");
        if (!existsSync(path)) {
          return [];
        }
        const body = readFileSync(path, "utf8")
          .slice(0, SUMMARY_CHAR_CAP)
          .trim();
        if (!body) {
          return [];
        }
        try {
          return await extractStatements(llm, body);
        } catch (error) {
          console.warn(
            `  추출 실패 [${noteId}]: ${error instanceof Error ? error.message : String(error)}`,
          );
          return [];
        }
      }),
    );
    for (const [j, statements] of results.entries()) {
      const noteId = batch[j] ?? "unknown";
      for (const s of statements) {
        all.push({ ...s, id: `${noteId}::${s.id}` });
      }
    }
    done += batch.length;
    console.log(
      `  추출 ${done}/${noteIds.length}글 — distractor 누적 ${all.length}`,
    );
  }
  return all;
}

async function main() {
  const voyageKey = process.env["VOYAGE_API_KEY"]?.trim();
  if (!voyageKey) {
    console.error("VOYAGE_API_KEY is required");
    process.exit(1);
  }
  const tiroEnv = process.env["TIRO_DIR"]?.trim();
  const tiroDir = tiroEnv
    ? resolve(tiroEnv)
    : resolve(__dirname, "../../../../../.local/tiro-samples");
  if (!existsSync(resolve(tiroDir, "curation.json"))) {
    console.error(`tiro 데이터 없음: ${tiroDir} (curation.json 미발견)`);
    process.exit(1);
  }

  const noteCount = Number(process.argv[2]) || DEFAULT_NOTE_COUNT;
  const collection =
    process.env["QDRANT_COLLECTION"] ?? "statements_eval_dense";
  const provider = createVoyageProvider({ apiKey: voyageKey });
  const client = createQdrantClient();
  const store = createQdrantStore(client);
  const llm = createEvalLlm();

  const standalone = loadStandaloneIds(tiroDir);
  const noteIds = standalone.slice(0, noteCount);
  console.log(
    `tiro standalone ${standalone.length}개 중 ${noteIds.length}개 요약에서 distractor 추출 (모델 ${resolveEvalModelId()})...`,
  );
  const distractors = await collectDistractors({ llm, tiroDir, noteIds });

  const golden = SEED_DOCUMENTS.flatMap((doc) => doc.goldenStatements);
  const pointToGolden = new Map(golden.map((g) => [pointIdOf(g.id), g.id]));
  const uploadedAt = new Date().toISOString();

  const { exists } = await client.collectionExists(collection);
  if (exists) {
    await client.deleteCollection(collection);
  }
  await store.ensureCollection();

  const corpus = [
    ...golden.map((g) => ({
      statementId: pointIdOf(g.id),
      spaceId: EVAL_SPACE_ID,
      content: g.content,
      type: g.type,
      confidence: g.type === "claim" ? g.confidence : null,
      createdAt: uploadedAt,
    })),
    ...distractors.map((d) => ({
      statementId: pointIdOf(d.id),
      spaceId: EVAL_SPACE_ID,
      content: d.content,
      type: d.type,
      confidence: d.confidence,
      createdAt: uploadedAt,
    })),
  ];
  console.log(
    `코퍼스 적재 중 — 골든 ${golden.length} + distractor ${distractors.length} = ${corpus.length}개...`,
  );
  for (let i = 0; i < corpus.length; i += UPSERT_BATCH) {
    await store.upsertStatements(provider, corpus.slice(i, i + UPSERT_BATCH));
  }

  const reports = [];
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
    const isAnswerable = expected.size > 0;
    const topK = results.slice(0, RECALL_K);
    const recallAtK = isAnswerable
      ? topK.filter((r) => r.isExpected).length / expected.size
      : null;
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
      `${marker} [${seedQuery.id}] r@${RECALL_K}=${recallAtK === null ? "n/a" : round(recallAtK)} — top1 ${results[0]?.goldenId ?? "(없음)"} (${results[0]?.score ?? "-"})`,
    );
  }

  const answerable = reports.filter((r) => r.recallAtK !== null);
  const recallDense = round(
    answerable.reduce((sum, r) => sum + (r.recallAtK ?? 0), 0) /
      answerable.length,
  );
  const summary = {
    recallAtK: recallDense,
    mrr: round(
      answerable.reduce((sum, r) => sum + (r.reciprocalRank ?? 0), 0) /
        answerable.length,
    ),
    byAxis: Object.fromEntries(
      [...new Set(answerable.map((r) => r.failureAxis))].map((axis) => {
        const rs = answerable.filter((r) => r.failureAxis === axis);
        return [
          axis,
          {
            queries: rs.length,
            recallAtK: round(
              rs.reduce((sum, r) => sum + (r.recallAtK ?? 0), 0) / rs.length,
            ),
          },
        ];
      }),
    ),
    noAnswerTopScores: reports
      .filter((r) => r.recallAtK === null)
      .map((r) => ({
        queryId: r.queryId,
        topScores: r.results.slice(0, NO_ANSWER_TOP_SCORES).map((x) => x.score),
        topIsDistractor: !(r.results[0]?.goldenId ?? "").includes("-s"),
      })),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-retrieval-dense-${timestamp}.json`,
  );
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        embeddingModel: provider.model,
        extractionModel: resolveEvalModelId(),
        recallK: RECALL_K,
        corpusSize: corpus.length,
        goldenCount: golden.length,
        distractorCount: distractors.length,
        notesUsed: noteIds.length,
        summary,
        queries: reports,
      },
      null,
      2,
    ),
  );

  console.log("\n=== 요약 (난도 ↑: 빽빽한 실코퍼스) ===");
  console.log(
    `코퍼스 ${corpus.length}개 (골든 ${golden.length} + distractor ${distractors.length})`,
  );
  console.log(
    `recall@${RECALL_K}: sparse ${SPARSE_RECALL_BASELINE} → dense ${recallDense}  (Δ ${round(recallDense - SPARSE_RECALL_BASELINE)})`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("dense retrieval run failed:", error);
  process.exit(1);
});
