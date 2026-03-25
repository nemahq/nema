// 실행: pnpm tsx apps/server/src/eval/eval-drafting.ts

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "@server/env";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  buildEditCycleMessage,
  buildFirstCallMessage,
  DRAFTING_SYSTEM_PROMPT,
} from "@server/prompts/drafting";

import { PHASE1_EDIT_SEEDS, PHASE1_SEEDS } from "./seed-data";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../.."));

interface EvalResult {
  id: string;
  category: string;
  description: string;
  input: string;
  output: string | null;
  error: string | null;
  checkpoints: string[];
  latencyMs: number;
}

async function collectStream(
  provider: LlmProvider,
  message: string,
): Promise<string> {
  let text = "";
  for await (const chunk of provider.generateStream({
    systemPrompt: DRAFTING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    temperature: 0,
  })) {
    text += chunk;
  }
  return text;
}

async function main() {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  const provider = new OpenAiProvider({
    apiKey,
    model: DEFAULT_STANDARD_MODEL,
  });
  const results: EvalResult[] = [];

  // 일반 시드
  for (const seed of PHASE1_SEEDS) {
    console.log(`[${seed.id}] ${seed.category} — 실행 중...`);
    const start = Date.now();

    try {
      const output = await collectStream(
        provider,
        buildFirstCallMessage(seed.input, "ko"),
      );

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
      const output = await collectStream(
        provider,
        buildEditCycleMessage({
          previousBody: seed.previousBody,
          editRequest: seed.editRequest,
          contentLanguage: "ko",
        }),
      );

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
    model: DEFAULT_STANDARD_MODEL,
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
