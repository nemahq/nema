// 시간 경로 eval — 질의→토큰 정확도 (temporal-query-design 8장 B, 채점 나).
//
// 구조화 레이어(structureQuery의 프롬프트+매핑)가 시간 질의를 기대 토큰으로 옮기는지 본다.
// LLM 1콜이라 키가 필요하다 — 끝단 정확도(채점 가)는 키 없이 도는 time-path.test.ts.
// 실행: pnpm tsx src/eval/statement-engine/run-time-path.ts
//   (EVAL_LLM_MODEL로 측정 모델 교체 — 미설정이면 prod 기본. Vertex는 ADC 인증.)
//
// 이 골든(질의·기대 토큰)은 ④ 자동 scoping과 공유한다 — ④는 topic 축 기대값을 더하면 된다.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 러너는 Supabase·Qdrant를 쓰지 않는다 — env 스키마(필수 키) 통과용 자리값
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "eval-unused";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";

import { loadEnv } from "@server/env";
import { createEvalLlm, resolveEvalModelId } from "@server/eval/eval-llm";
import {
  buildQueryStructuringMessage,
  QUERY_STRUCTURING_SYSTEM_PROMPT,
  QueryStructuringRawSchema,
} from "@server/prompts/query-structuring";
import { mapRawToStructure } from "@server/services/query-structuring";

import {
  RELOCATED_TEMPORAL_QUERIES,
  TEMPORAL_EVAL_QUERY_NOW,
} from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../../.."));

const ISO_DATE_LENGTH = 10;
const TODAY = TEMPORAL_EVAL_QUERY_NOW.slice(0, ISO_DATE_LENGTH);

async function main() {
  const llm = createEvalLlm();
  console.log(
    `질의→토큰 정확도 (모델 ${resolveEvalModelId()}, today ${TODAY})\n`,
  );

  let correct = 0;
  for (const query of RELOCATED_TEMPORAL_QUERIES) {
    const raw = await llm.generateStructured({
      schema: QueryStructuringRawSchema,
      schemaName: "query_structuring",
      systemPrompt: QUERY_STRUCTURING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildQueryStructuringMessage({
            query: query.query,
            todayIsoDate: TODAY,
            topics: [],
          }),
        },
      ],
    });
    const { time } = mapRawToStructure(raw, new Set());
    const expected = JSON.stringify(query.expectedToken);
    const got = JSON.stringify(time);
    const ok = expected === got;
    if (ok) {
      correct++;
    }
    console.log(`${ok ? "✓" : "✗"} [${query.id}] ${query.query}`);
    if (!ok) {
      console.log(`    기대: ${expected}`);
      console.log(`    실제: ${got}`);
    }
  }

  console.log(
    `\n질의→토큰 정확도: ${correct}/${RELOCATED_TEMPORAL_QUERIES.length}`,
  );
}

main().catch((error) => {
  console.error("time-path run failed:", error);
  process.exit(1);
});
