// "같음(merge)" 경계 probe 러너 — NEM-162 선결 de-risk.
//
// 실행: apps/server에서  pnpm tsx src/eval/relation-engine/run-merge-boundary.ts
//   --runs N : 쌍당 N회 (기본 5 — LLM 변동 흡수)
// 필요 키: OPENAI_API_KEY. 채점은 코드 정확 비교(심판 LLM 없음).
//
// 본 판정 프롬프트·스키마(shared enum·DB)는 건드리지 않는다 — 합치기를 본격 구현하기
// 전에 "모델이 엄격한 같음을 가를 수 있나"만 격리해 재는 probe다. 가르면 본 구현으로,
// 못 가르면 경계 정의를 다시 본다.

process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "eval-unused";

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { loadEnv } from "@server/env";
import { round } from "@server/eval/statement-engine/metrics";
import { createLimiter } from "@server/infra/llm/limiter";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  LINKING_EFFORT,
  LINKING_TIMEOUT_MS,
} from "@server/infra/statement-sync/worker";

import { MERGE_BOUNDARY_PAIRS } from "./merge-boundary-seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const DEFAULT_RUNS = 5;
const PROBE_CONCURRENCY = 4;
const PROBE_MAX_ATTEMPTS = 3;
const PROBE_RETRY_DELAY_MS = 3_000;

function parseRuns(): number {
  const i = process.argv.indexOf("--runs");
  if (i !== -1) {
    const n = Number(process.argv[i + 1]);
    if (Number.isInteger(n) && n > 0) {
      return n;
    }
  }
  return DEFAULT_RUNS;
}

// 합치기 자리에서 모델이 같음을 다른 관계와 가르는지 격리 측정. "same"은 본 enum에 없는
// probe 전용 카테고리 — 엄격 경계(순수 재진술, 새 정보 없음)를 못박는다.
const PROBE_SYSTEM_PROMPT = `You classify how statement B relates to statement A. Each statement is one atomic unit of someone's thinking. Pick exactly ONE category.

## Categories

- "same": A and B assert the SAME claim — the same proposition restated, possibly in different words, with NO new information. A re-entry of something already recorded. This is the only category that means "these are duplicates to be merged."
- "supports": one is a reason, evidence, or rationale for the other. They carry different content; one backs the other.
- "replaces": one deliberately retires the other — an explicit switch or reversal ("we're dropping X for Y", "no longer", "now instead").
- "conflicts": both assert something that cannot both be true now, and neither retires the other.
- "resolves": one answers or closes the other, where the other is a question or an open task.
- "none": merely the same topic, or no genuine relation.

## What "same" is NOT — guard against over-merging

Merging collapses two records into one, so be strict. Emit "same" ONLY for a true restatement.

- A firmer or more confident version of the same direction is NOT same. "X is the leading candidate" (a guess) and "X is confirmed" (certain) share a direction but differ in conviction — that progression is information; do not merge it. Prefer "none" (or "replaces" if an explicit switch).
- A version that adds a reason, detail, or qualifier is NOT same — it carries new information. That is "supports" or "none", never "same".
- Same topic or shared keywords is NOT same. That is "none".
- When unsure whether two statements are truly the same claim or merely close, do NOT pick "same". A false merge destroys a distinct fact; abstain to "none" instead.

## Output

JSON: { "category": "same" | "supports" | "replaces" | "conflicts" | "resolves" | "none", "why": string }
"why" is one short clause justifying the pick.`;

const ProbeSchema = z.object({
  category: z.enum([
    "same",
    "supports",
    "replaces",
    "conflicts",
    "resolves",
    "none",
  ]),
  why: z.string(),
});

type Category = z.infer<typeof ProbeSchema>["category"];

function buildMessage(
  a: { content: string; type: string; confidence: string | null },
  b: { content: string; type: string; confidence: string | null },
): string {
  const fmt = (s: {
    content: string;
    type: string;
    confidence: string | null;
  }) =>
    s.confidence
      ? `(${s.type}, ${s.confidence}) ${s.content}`
      : `(${s.type}) ${s.content}`;
  return `A: ${fmt(a)}\nB: ${fmt(b)}`;
}

interface PredictionRecord {
  pairId: string;
  mergeable: boolean;
  trueRelation: string;
  predictions: Category[];
  /** 같음이라 부른 비율 */
  sameRate: number;
}

// 합쳐야면 같음 100%가 ✓·일부면 △, 합치면X면 같음 0%가 ✓·하나라도 같음이면 ✗(false-merge)
function markFor(mergeable: boolean, sameRate: number): string {
  if (mergeable) {
    return sameRate === 1 ? "✓" : "△";
  }
  return sameRate === 0 ? "✓" : "✗";
}

const limit = createLimiter(PROBE_CONCURRENCY);

async function classify(
  llm: OpenAiProvider,
  message: string,
): Promise<Category> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PROBE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const out = await limit(() =>
        llm.generateStructured({
          schema: ProbeSchema,
          schemaName: "merge_boundary_probe",
          systemPrompt: PROBE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: message }],
          effort: LINKING_EFFORT,
          timeoutMs: LINKING_TIMEOUT_MS,
          maxRetries: 0,
        }),
      );
      return out.category;
    } catch (error) {
      lastError = error;
      await new Promise((r) =>
        setTimeout(r, PROBE_RETRY_DELAY_MS * (attempt + 1)),
      );
    }
  }
  throw lastError;
}

async function main() {
  const openaiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!openaiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }
  const runs = parseRuns();
  const llm = new OpenAiProvider({
    apiKey: openaiKey,
    model: DEFAULT_STANDARD_MODEL,
  });

  const records: PredictionRecord[] = [];
  for (const pair of MERGE_BOUNDARY_PAIRS) {
    const message = buildMessage(pair.a, pair.b);
    const predictions = await Promise.all(
      Array.from({ length: runs }, () => classify(llm, message)),
    );
    const sameCount = predictions.filter((p) => p === "same").length;
    records.push({
      pairId: pair.id,
      mergeable: pair.mergeable,
      trueRelation: pair.trueRelation,
      predictions,
      sameRate: round(sameCount / runs),
    });
  }

  // "같음" 판정의 정밀도·재현율 — 위험한 오류는 false-merge(같지 않은데 같다고)
  const allPreds = records.flatMap((r) =>
    r.predictions.map((p) => ({ pred: p, mergeable: r.mergeable })),
  );
  const predictedSame = allPreds.filter((x) => x.pred === "same");
  const truePositive = predictedSame.filter((x) => x.mergeable).length;
  const falseMerge = predictedSame.filter((x) => !x.mergeable).length;
  const mergeableTotal = allPreds.filter((x) => x.mergeable).length;
  const samePrecision = predictedSame.length
    ? round(truePositive / predictedSame.length)
    : 1;
  const sameRecall = mergeableTotal ? round(truePositive / mergeableTotal) : 1;

  const falseMergePairs = records
    .filter((r) => !r.mergeable && r.predictions.includes("same"))
    .map((r) => ({
      pairId: r.pairId,
      trueRelation: r.trueRelation,
      sameRate: r.sameRate,
    }));
  const missedPairs = records
    .filter((r) => r.mergeable && r.sameRate < 1)
    .map((r) => ({ pairId: r.pairId, sameRate: r.sameRate }));

  const summary = {
    runs,
    pairs: MERGE_BOUNDARY_PAIRS.length,
    samePrecision,
    sameRecall,
    falseMergeCount: falseMerge,
    falseMergePairs,
    missedPairs,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-merge-boundary-${timestamp}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      { runAt: new Date().toISOString(), summary, records },
      null,
      2,
    ),
  );

  console.log("\n=== 쌍별 같음 판정율 (sameRate) ===");
  for (const r of records) {
    const flag = r.mergeable ? "합쳐야" : "합치면X";
    const mark = markFor(r.mergeable, r.sameRate);
    console.log(
      `  ${mark} [${flag}] ${r.pairId} — same ${r.sameRate} (참관계 ${r.trueRelation})`,
    );
  }
  console.log("\n=== 요약 ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((error) => {
  console.error("eval run failed:", error);
  process.exit(1);
});
