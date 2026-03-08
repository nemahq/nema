// Phase 1 (Drafting) 평가 스크립트
// 시드 데이터를 LLM에 돌리고 결과를 JSON으로 저장
//
// 실행: pnpm tsx apps/server/src/eval/run-phase1.ts

import "dotenv/config";

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DraftOutputSchema } from "@nema-io/shared/src/schemas/structuring.js";

import { OpenAiProvider } from "@server/infra/llm/openai-provider.js";
import {
  buildEditCycleMessage,
  buildFirstCallMessage,
  PHASE1_SYSTEM_PROMPT,
} from "@server/prompts/drafting.js";

import { PHASE1_EDIT_SEEDS, PHASE1_SEEDS } from "./seed-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface EvalResult {
  id: string;
  category: string;
  description: string;
  input: string;
  output: {
    body: string;
    session_title: string | null;
  } | null;
  error: string | null;
  checkpoints: string[];
  latencyMs: number;
}

async function main() {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY 환경변수가 필요합니다.");
    process.exit(1);
  }

  const provider = new OpenAiProvider({ apiKey });
  const results: EvalResult[] = [];

  // 일반 시드
  for (const seed of PHASE1_SEEDS) {
    console.log(`[${seed.id}] ${seed.category} — 실행 중...`);
    const start = Date.now();

    try {
      const output = await provider.generateStructured({
        schema: DraftOutputSchema,
        schemaName: "DraftOutput",
        systemPrompt: PHASE1_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildFirstCallMessage(seed.input) },
        ],
        temperature: 0,
      });

      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        input: seed.input,
        output,
        error: null,
        checkpoints: seed.checkpoints,
        latencyMs: Date.now() - start,
      });

      console.log(`  ✓ ${Date.now() - start}ms`);
    } catch (e) {
      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        input: seed.input,
        output: null,
        error: e instanceof Error ? e.message : String(e),
        checkpoints: seed.checkpoints,
        latencyMs: Date.now() - start,
      });

      console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 수정 사이클 시드
  for (const seed of PHASE1_EDIT_SEEDS) {
    console.log(`[${seed.id}] ${seed.category} — 실행 중...`);
    const start = Date.now();

    try {
      const output = await provider.generateStructured({
        schema: DraftOutputSchema,
        schemaName: "DraftOutput",
        systemPrompt: PHASE1_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildEditCycleMessage(seed.previousBody, seed.editRequest),
          },
        ],
        temperature: 0,
      });

      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        input: `[previous_body] ${seed.previousBody}\n[edit_request] ${seed.editRequest}`,
        output,
        error: null,
        checkpoints: seed.checkpoints,
        latencyMs: Date.now() - start,
      });

      console.log(`  ✓ ${Date.now() - start}ms`);
    } catch (e) {
      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        input: `[previous_body] ${seed.previousBody}\n[edit_request] ${seed.editRequest}`,
        output: null,
        error: e instanceof Error ? e.message : String(e),
        checkpoints: seed.checkpoints,
        latencyMs: Date.now() - start,
      });

      console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 결과 저장
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(__dirname, `results-${timestamp}.json`);

  const report = {
    runAt: new Date().toISOString(),
    model: "gpt-4o",
    temperature: 0,
    totalSeeds: results.length,
    errors: results.filter((r) => r.error).length,
    results,
  };

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
  console.log(`총 ${results.length}개 중 에러 ${report.errors}개`);
}

main();
