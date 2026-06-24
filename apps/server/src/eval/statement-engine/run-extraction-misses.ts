// 추출 안정 누락 러너 — 다중 run으로 "진짜 드롭"과 "경계 wobble"을 가른다 (NEM-168 태스크 2).
//
// 실행: apps/server에서  pnpm tsx src/eval/statement-engine/run-extraction-misses.ts
// 필요 키: 측정 모델 키(EVAL_LLM_MODEL), ANTHROPIC_API_KEY(심판).
//
// 왜: 측정 #10이 "누락 집합이 run마다 바뀐다"를 발견 — 단발 귀속은 못 믿는다. 추출을 여러 번
//   돌려 골든별 누락 빈도를 집계하면, 대부분 run에서 놓치는 "안정 누락"(진짜 모델 약점)과
//   가끔 놓치는 "wobble"(경계 흔들림 노이즈)이 갈린다. 안정 누락만 프롬프트로 고칠 가치가 있다.
// 흐름: 골든 글 N회 추출 → 각 run을 골든과 매칭 → 골든별 miss 횟수 집계 → missRate로 정렬·축 분포.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { loadEnv } from "@server/env";
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import type { LlmProvider } from "@server/infra/llm/llm-provider";

import { extract, matchStatements } from "./extraction-core";
import { createJudge, type Judge } from "./judge";
import { round } from "./metrics";
import { type EvalAxis, SEED_DOCUMENTS } from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

// 안정 누락을 잡으려면 단발보다 훨씬 많이 — 빈도가 신호다.
const RUNS_PER_DOC = Number(process.env["MISS_RUNS"]) || 20;
const DEFAULT_JUDGE_CONCURRENCY = 16;
const JUDGE_CONCURRENCY =
  Number(process.env["JUDGE_CONCURRENCY"]) || DEFAULT_JUDGE_CONCURRENCY;
// 대부분 run에서 놓치면 안정 누락 — 진짜 약점. 그 미만은 wobble.
const STABLE_MISS_THRESHOLD = 0.5;

interface GoldenMiss {
  id: string;
  content: string;
  axes: EvalAxis[];
  missCount: number;
  missRate: number;
}

async function measureDoc(params: {
  llm: LlmProvider;
  judge: Judge;
  doc: (typeof SEED_DOCUMENTS)[number];
}): Promise<GoldenMiss[]> {
  const { llm, judge, doc } = params;
  const runs = await Promise.all(
    Array.from({ length: RUNS_PER_DOC }, () => extract(llm, doc.input)),
  );

  const missCount = new Map<string, number>(
    doc.goldenStatements.map((golden) => [golden.id, 0]),
  );
  // run마다 매칭 — 골든이 어느 추출과도 안 짝지어지면 그 run에서 누락
  await Promise.all(
    runs.map(async (run) => {
      const match = await matchStatements({
        judge,
        left: run,
        right: doc.goldenStatements,
        leftContent: (statement) => statement.content,
        rightContent: (golden) => golden.content,
      });
      for (const golden of match.unmatchedRight) {
        missCount.set(golden.id, (missCount.get(golden.id) ?? 0) + 1);
      }
    }),
  );

  return doc.goldenStatements.map((golden) => {
    const count = missCount.get(golden.id) ?? 0;
    return {
      id: golden.id,
      content: golden.content,
      axes: golden.axes,
      missCount: count,
      missRate: round(count / RUNS_PER_DOC),
    };
  });
}

async function main() {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"]?.trim();
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is required (judge is Claude-locked)");
    process.exit(1);
  }
  const llm = createEvalLlm();
  const judge = createJudge(anthropicKey, JUDGE_CONCURRENCY);

  const started = Date.now();
  console.log(
    `골든 글 ${SEED_DOCUMENTS.length}개 × ${RUNS_PER_DOC}회 추출 — 안정 누락 집계 (모델 ${resolveEvalModelId()})...`,
  );

  const allMisses: GoldenMiss[] = [];
  const failedDocs: Array<{ docId: string; error: string }> = [];
  await Promise.all(
    SEED_DOCUMENTS.map(async (doc) => {
      try {
        const misses = await measureDoc({ llm, judge, doc });
        allMisses.push(...misses);
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

  if (allMisses.length === 0) {
    console.error("all documents failed — no metrics to report");
    process.exit(1);
  }

  const stable = allMisses
    .filter((miss) => miss.missRate >= STABLE_MISS_THRESHOLD)
    .sort((a, b) => b.missRate - a.missRate);

  // 축별 — 안정 누락이 어느 축에 몰리나(프롬프트 튜닝 우선순위의 1급 산출물)
  const axisTally = new Map<
    EvalAxis,
    { total: number; stableMissed: number }
  >();
  for (const miss of allMisses) {
    const isStable = miss.missRate >= STABLE_MISS_THRESHOLD;
    for (const axis of miss.axes) {
      const tally = axisTally.get(axis) ?? { total: 0, stableMissed: 0 };
      tally.total += 1;
      if (isStable) {
        tally.stableMissed += 1;
      }
      axisTally.set(axis, tally);
    }
  }

  const summary = {
    runsPerDoc: RUNS_PER_DOC,
    stableMissThreshold: STABLE_MISS_THRESHOLD,
    goldenTotal: allMisses.length,
    stableMissCount: stable.length,
    stableMisses: stable,
    axisTally: Object.fromEntries(axisTally),
    // 전 골든 누락률 분포 — 안정 누락 위 wobble까지 한눈에
    allByMissRate: [...allMisses].sort((a, b) => b.missRate - a.missRate),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-extraction-misses-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        model: resolveEvalModelId(),
        judgeUsage: judge.usage(),
        failedDocs,
        summary,
      },
      null,
      2,
    ),
  );

  console.log("\n=== 안정 누락 (missRate ≥ 0.5) ===");
  for (const miss of stable) {
    console.log(
      `  ${miss.missRate} [${miss.axes.join(",")}] ${miss.id}: ${miss.content.slice(0, 40)}`,
    );
  }
  console.log(`\n축별:`, JSON.stringify(Object.fromEntries(axisTally)));
  console.log(`결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("eval run failed:", error);
  process.exit(1);
});
