// eval B — scope(주제로 좁힘) vs 전역 recall@k (auto-scoping-design §6 B).
//
// 실행: docker run -d -p 6333:6333 qdrant/qdrant 후
//   set -a; source ~/.config/nema/.env.secret; set +a
//   TIRO_DIR=/abs/.local/tiro-samples pnpm tsx src/eval/statement-engine/run-retrieval-scoped.ts [standalone수=80]
//
// 코퍼스 = tiro threaded 노트(18주제 라벨) + standalone(무태그 distractor). 같은 질의를
// (가) 전역 전체 검색과 (나) coarse가 고른 주제 + 무태그로 좁힌 검색으로 각각 돌려 비교한다.
// 정답 = 질의 gold 주제의 진술(근사: 그 주제 노트들의 추출 진술 전부). 채점은 top-k 안 gold 주제 비율.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";
process.env["QDRANT_COLLECTION"] ??= "statements_eval_scoped";
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
import { SCOPED_QUERIES } from "./retrieval-scoped-seed";
import { selectTopics } from "./run-coarse-scoping";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const RECALL_K = 5;
const SEARCH_LIMIT = 15;
const NO_THRESHOLD = -1;
const EVAL_SPACE_ID = "00000000-0000-4000-8000-0000000000e7";
const DEFAULT_STANDALONE = 80;
const SUMMARY_CHAR_CAP = 8_000;
const EXTRACT_CONCURRENCY = 5;
const UPSERT_BATCH = 100;

interface Thread {
  id: string;
  members: string[];
}

type StmtType = "claim" | "question" | "todo";
type Confidence = "certain" | "guess" | null;

interface NoteStatement {
  content: string;
  type: StmtType;
  confidence: Confidence;
}

interface CorpusStmt extends NoteStatement {
  id: string;
  thread: string | null;
}

function loadCuration(tiroDir: string): {
  threads: Thread[];
  standalone: string[];
} {
  const c = JSON.parse(
    readFileSync(resolve(tiroDir, "curation.json"), "utf8"),
  ) as {
    threads: { id: string; members: string[] }[];
    standalone: string[];
  };
  return {
    threads: c.threads.map((t) => ({ id: t.id, members: t.members })),
    standalone: c.standalone,
  };
}

async function extractFromNote(args: {
  llm: LlmProvider;
  tiroDir: string;
  noteId: string;
}): Promise<NoteStatement[]> {
  const { llm, tiroDir, noteId } = args;
  const path = resolve(tiroDir, "notes", noteId, "summary.md");
  if (!existsSync(path)) {
    return [];
  }
  const body = readFileSync(path, "utf8").slice(0, SUMMARY_CHAR_CAP).trim();
  if (!body) {
    return [];
  }
  try {
    const out = await llm.generateStructured({
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
    return out.statements.map((s) => ({
      content: s.content,
      type: s.type,
      confidence: s.type === "claim" ? s.confidence : null,
    }));
  } catch (error) {
    console.warn(
      `  추출 실패 [${noteId}]: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

async function collectCorpus(args: {
  llm: LlmProvider;
  tiroDir: string;
  jobs: { noteId: string; thread: string | null }[];
}): Promise<CorpusStmt[]> {
  const { llm, tiroDir, jobs } = args;
  const all: CorpusStmt[] = [];
  let done = 0;
  for (let i = 0; i < jobs.length; i += EXTRACT_CONCURRENCY) {
    const batch = jobs.slice(i, i + EXTRACT_CONCURRENCY);
    const results = await Promise.all(
      batch.map((j) => extractFromNote({ llm, tiroDir, noteId: j.noteId })),
    );
    for (const [k, statements] of results.entries()) {
      const job = batch[k];
      if (!job) {
        continue;
      }
      statements.forEach((s, si) => {
        all.push({ id: `${job.noteId}::${si}`, thread: job.thread, ...s });
      });
    }
    done += batch.length;
    console.log(`  추출 ${done}/${jobs.length}글 — 진술 누적 ${all.length}`);
  }
  return all;
}

function scoreTopK(args: {
  hits: { statementId: string; score: number }[];
  threadByPoint: Map<string, string | null>;
  goldThread: string;
  goldTotal: number;
}): { hit: boolean; densityAtK: number; recallAtK: number } {
  const { hits, threadByPoint, goldThread, goldTotal } = args;
  const topK = hits.slice(0, RECALL_K);
  const goldInTopK = topK.filter(
    (h) => threadByPoint.get(h.statementId) === goldThread,
  ).length;
  return {
    hit: goldInTopK > 0,
    densityAtK: topK.length > 0 ? round(goldInTopK / topK.length) : 0,
    recallAtK:
      goldTotal > 0 ? round(goldInTopK / Math.min(RECALL_K, goldTotal)) : 0,
  };
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
  const standaloneCount = Number(process.argv[2]) || DEFAULT_STANDALONE;

  const { threads, standalone } = loadCuration(tiroDir);
  const jobs = [
    ...threads.flatMap((t) =>
      t.members.map((noteId) => ({ noteId, thread: t.id as string | null })),
    ),
    ...standalone
      .slice(0, standaloneCount)
      .map((noteId) => ({ noteId, thread: null as string | null })),
  ];
  const taggedCount = threads.reduce((sum, t) => sum + t.members.length, 0);

  const provider = createVoyageProvider({ apiKey: voyageKey });
  const client = createQdrantClient();
  const store = createQdrantStore(client);
  const llm = createEvalLlm();

  console.log(
    `코퍼스 추출 — threaded ${taggedCount}글(${threads.length}주제) + standalone ${Math.min(standaloneCount, standalone.length)}글 (모델 ${resolveEvalModelId()})...`,
  );
  const corpus = await collectCorpus({ llm, tiroDir, jobs });

  const threadByPoint = new Map<string, string | null>();
  const pointsByThread = new Map<string, string[]>();
  const untaggedPoints: string[] = [];
  for (const s of corpus) {
    const pid = pointIdOf(s.id);
    threadByPoint.set(pid, s.thread);
    if (s.thread === null) {
      untaggedPoints.push(pid);
    } else {
      const arr = pointsByThread.get(s.thread) ?? [];
      arr.push(pid);
      pointsByThread.set(s.thread, arr);
    }
  }

  const collection =
    process.env["QDRANT_COLLECTION"] ?? "statements_eval_scoped";
  const { exists } = await client.collectionExists(collection);
  if (exists) {
    await client.deleteCollection(collection);
  }
  await store.ensureCollection();

  const uploadedAt = new Date().toISOString();
  const points = corpus.map((s) => ({
    statementId: pointIdOf(s.id),
    spaceId: EVAL_SPACE_ID,
    content: s.content,
    type: s.type,
    confidence: s.confidence,
    createdAt: uploadedAt,
  }));
  console.log(`코퍼스 적재 — ${points.length}개 진술...`);
  for (let i = 0; i < points.length; i += UPSERT_BATCH) {
    await store.upsertStatements(provider, points.slice(i, i + UPSERT_BATCH));
  }

  const reports = [];
  for (const query of SCOPED_QUERIES) {
    const goldThread = query.gold[0];
    if (!goldThread) {
      continue;
    }
    const goldTotal = (pointsByThread.get(goldThread) ?? []).length;

    const globalHits = await store.search(provider, {
      spaceIds: [EVAL_SPACE_ID],
      query: query.text,
      limit: SEARCH_LIMIT,
      scoreThreshold: NO_THRESHOLD,
    });

    const picked = await selectTopics({ llm, query, variant: "name-only" });
    const scopeIds = [
      ...new Set([
        ...picked.flatMap((t) => pointsByThread.get(t) ?? []),
        ...untaggedPoints,
      ]),
    ];
    // coarse가 못 좁히면(빈 선택) 전역으로 강등 — production과 같은 동작.
    const scopeHits = scopeIds.length
      ? await store.search(provider, {
          spaceIds: [EVAL_SPACE_ID],
          query: query.text,
          limit: SEARCH_LIMIT,
          scoreThreshold: NO_THRESHOLD,
          statementIds: scopeIds,
        })
      : globalHits;

    const g = scoreTopK({
      hits: globalHits,
      threadByPoint,
      goldThread,
      goldTotal,
    });
    const s = scoreTopK({
      hits: scopeHits,
      threadByPoint,
      goldThread,
      goldTotal,
    });
    const coarseHitGold = picked.includes(goldThread);
    reports.push({
      queryId: query.id,
      goldThread,
      goldTotal,
      coarsePicked: picked,
      coarseHitGold,
      global: g,
      scope: s,
    });
    console.log(
      `[${query.id}] gold=${goldThread}(${goldTotal}) coarse→[${picked.join(",")}] ${coarseHitGold ? "✓" : "✗"} | 전역 d@k=${g.densityAtK} hit=${g.hit} → scope d@k=${s.densityAtK} hit=${s.hit}`,
    );
  }

  const avg = (xs: number[]): number =>
    xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const summary = {
    queries: reports.length,
    coarseAccuracy: avg(reports.map((r) => (r.coarseHitGold ? 1 : 0))),
    global: {
      hitRate: avg(reports.map((r) => (r.global.hit ? 1 : 0))),
      densityAtK: avg(reports.map((r) => r.global.densityAtK)),
      recallAtK: avg(reports.map((r) => r.global.recallAtK)),
    },
    scope: {
      hitRate: avg(reports.map((r) => (r.scope.hit ? 1 : 0))),
      densityAtK: avg(reports.map((r) => r.scope.densityAtK)),
      recallAtK: avg(reports.map((r) => r.scope.recallAtK)),
    },
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-retrieval-scoped-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        embeddingModel: provider.model,
        extractionModel: resolveEvalModelId(),
        recallK: RECALL_K,
        corpusSize: points.length,
        threadCount: threads.length,
        taggedNotes: taggedCount,
        untaggedNotes: Math.min(standaloneCount, standalone.length),
        summary,
        queries: reports,
      },
      null,
      2,
    ),
  );

  console.log("\n=== 요약 (eval B: scope vs 전역) ===");
  console.log(
    `코퍼스 ${points.length}진술 (threaded ${threads.length}주제 ${taggedCount}글 + 무태그 ${Math.min(standaloneCount, standalone.length)}글)`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("scoped retrieval run failed:", error);
  process.exit(1);
});
