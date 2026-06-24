// coarse scoping 러너 (auto-scoping-design §6 A) — "질의 → 맞는 주제 고르기"의 recall.
//
// 실행: apps/server에서  pnpm tsx src/eval/statement-engine/run-coarse-scoping.ts
// 필요 키: 측정 모델 키(기본 OPENAI_API_KEY; EVAL_LLM_MODEL로 교체). 임베딩·Qdrant·DB 안 씀.
//
// 이름만 vs 이름+설명 두 변형을 같은 질의로 돌려, 설명(§8 #4)이 라우팅을 얼마나 올리는지 가른다.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// loadEnv의 필수 키 스키마 통과용 자리값 — 이 러너는 LLM만 쓴다.
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";

import { loadEnv } from "@server/env";
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import {
  buildCoarseScopingMessage,
  COARSE_SCOPING_SYSTEM_PROMPT,
  CoarseScopingRawSchema,
} from "@server/prompts/coarse-scoping";

import {
  COARSE_QUERIES,
  COARSE_TOPICS,
  type CoarseBand,
  type CoarseQuery,
} from "./coarse-scoping-seed";
import { round } from "./metrics";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const CONCURRENCY = 2;
const RETRIES = 4;
const RETRY_BASE_DELAY_MS = 800;
const VALID_IDS = new Set(COARSE_TOPICS.map((t) => t.id));

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// Vertex가 간헐적으로 499(CANCELLED)를 던져 한 콜 실패로 전체 run이 죽는다 — 백오프 재시도.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastErr;
}

type Variant = "name-only" | "name+desc";
const VARIANTS: Variant[] = ["name-only", "name+desc"];
const BANDS: CoarseBand[] = ["thematic", "buried", "adjacent", "degrade"];

// production과 같은 시스템 프롬프트·메시지 빌더를 그대로 쓴다 — eval이 실제 배선과 갈라지지 않게.
// 이름+설명 변형은 라벨에 설명을 실어 같은 빌더로 흘린다(설명 경로는 §8 #4 후속이라 production 빌더엔 아직 없다).
async function selectTopics(args: {
  llm: LlmProvider;
  query: CoarseQuery;
  variant: Variant;
}): Promise<string[]> {
  const { llm, query, variant } = args;
  const topics = COARSE_TOPICS.map((t) => ({
    id: t.id,
    label: variant === "name-only" ? t.label : `${t.label}: ${t.description}`,
  }));
  const out = await llm.generateStructured({
    schema: CoarseScopingRawSchema,
    schemaName: "coarse_selection",
    systemPrompt: COARSE_SCOPING_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildCoarseScopingMessage({ query: query.text, topics }),
      },
    ],
  });
  return [...new Set(out.topicIds.filter((id) => VALID_IDS.has(id)))];
}

// 강등 질의(gold 비움)는 빈 선택이 정답(전역으로 빠짐). 나머지는 정답 주제를 덮은 비율.
function recallOf(gold: string[], selected: string[]): number {
  if (gold.length === 0) {
    return selected.length === 0 ? 1 : 0;
  }
  const sel = new Set(selected);
  return gold.filter((g) => sel.has(g)).length / gold.length;
}

interface QueryResult {
  id: string;
  band: CoarseBand;
  text: string;
  gold: string[];
  selected: string[];
  recall: number;
  scopeSize: number;
}

async function runVariant(
  llm: LlmProvider,
  variant: Variant,
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  for (let i = 0; i < COARSE_QUERIES.length; i += CONCURRENCY) {
    const batch = COARSE_QUERIES.slice(i, i + CONCURRENCY);
    const scored = await Promise.all(
      batch.map(async (q) => {
        const selected = await withRetry(() =>
          selectTopics({ llm, query: q, variant }),
        );
        return {
          id: q.id,
          band: q.band,
          text: q.text,
          gold: q.gold,
          selected,
          recall: recallOf(q.gold, selected),
          scopeSize: selected.length,
        };
      }),
    );
    results.push(...scored);
  }
  return results;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

interface BandSummary {
  n: number;
  recall: number;
  scopeSize: number;
}

function bandSummary(results: QueryResult[], band: CoarseBand): BandSummary {
  const rows = results.filter((r) => r.band === band);
  return {
    n: rows.length,
    recall: round(mean(rows.map((r) => r.recall))),
    scopeSize: round(mean(rows.map((r) => r.scopeSize))),
  };
}

function summarize(results: QueryResult[]) {
  return {
    overallRecall: round(mean(results.map((r) => r.recall))),
    avgScopeSize: round(mean(results.map((r) => r.scopeSize))),
    byBand: {
      thematic: bandSummary(results, "thematic"),
      buried: bandSummary(results, "buried"),
      adjacent: bandSummary(results, "adjacent"),
      degrade: bandSummary(results, "degrade"),
    },
  };
}

async function main() {
  const llm = createEvalLlm();
  const model = resolveEvalModelId();
  console.log(`coarse scoping eval — model: ${model}\n`);

  const byVariant: Record<Variant, QueryResult[]> = {
    "name-only": [],
    "name+desc": [],
  };
  for (const variant of VARIANTS) {
    byVariant[variant] = await runVariant(llm, variant);
  }

  // 변형 비교 표: 밴드별 recall + scope 크기(비용)
  console.log(
    "band       | name-only recall / scope | name+desc recall / scope",
  );
  console.log(
    "-----------|--------------------------|-------------------------",
  );
  const sumOnly = summarize(byVariant["name-only"]);
  const sumDesc = summarize(byVariant["name+desc"]);
  for (const band of BANDS) {
    const a = sumOnly.byBand[band];
    const b = sumDesc.byBand[band];
    console.log(
      `${band.padEnd(10)} | ${String(a.recall).padEnd(13)} ${String(a.scopeSize).padEnd(10)} | ${String(b.recall).padEnd(13)} ${b.scopeSize}`,
    );
  }
  console.log(
    `${"overall".padEnd(10)} | ${String(sumOnly.overallRecall).padEnd(13)} ${String(sumOnly.avgScopeSize).padEnd(10)} | ${String(sumDesc.overallRecall).padEnd(13)} ${sumDesc.avgScopeSize}`,
  );

  // 놓친 질의(recall<1) 전수 — 어느 칸에서 새는지
  console.log("\n놓침 (recall < 1):");
  for (const variant of VARIANTS) {
    const misses = byVariant[variant].filter((r) => r.recall < 1);
    console.log(`\n[${variant}] ${misses.length}건`);
    for (const m of misses) {
      console.log(
        `  ${m.id}(${m.band}) gold=[${m.gold.join(",")}] got=[${m.selected.join(",")}] — ${m.text}`,
      );
    }
  }

  const outPath = resolve(__dirname, `results-coarse-scoping.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ model, byVariant, sumOnly, sumDesc }, null, 2),
  );
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
