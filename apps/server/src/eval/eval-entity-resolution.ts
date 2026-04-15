// 실행: pnpm --filter @nema-io/server exec tsx src/eval/eval-entity-resolution.ts

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "@server/env";
import { DEFAULT_MINI_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  buildEntityResolutionMessage,
  ENTITY_RESOLUTION_SYSTEM_PROMPT,
  EntityResolutionSchema,
} from "@server/prompts/entity-resolution";

import { ENTITY_RESOLUTION_SEEDS } from "./seed-data-entity-resolution";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../.."));

interface EvalResult {
  id: string;
  category: string;
  description: string;
  extracted: { name: string; type: string };
  candidates: { name: string; score: number }[];
  expectedMatch: string | null;
  actualMatch: string | null;
  pass: boolean;
  error: string | null;
  latencyMs: number;
}

async function main() {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  const provider = new OpenAiProvider({ apiKey, model: DEFAULT_MINI_MODEL });
  const results: EvalResult[] = [];

  for (const seed of ENTITY_RESOLUTION_SEEDS) {
    console.log(`[${seed.id}] ${seed.category} — 실행 중...`);
    const start = Date.now();

    try {
      const entries = [
        {
          extractedName: seed.extracted.name,
          extractedType: seed.extracted.type,
          candidates: seed.candidates,
        },
      ];

      const result = await provider.generateStructured({
        schema: EntityResolutionSchema,
        schemaName: "entity_resolution",
        systemPrompt: ENTITY_RESOLUTION_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildEntityResolutionMessage(entries) },
        ],
      });

      const resolution = result.resolutions.find(
        (r) =>
          r.extractedName === seed.extracted.name &&
          r.extractedType === seed.extracted.type,
      );

      const actualMatch = resolution?.matchedName ?? null;
      const pass = actualMatch === seed.expectedMatch;

      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        extracted: seed.extracted,
        candidates: seed.candidates,
        expectedMatch: seed.expectedMatch,
        actualMatch,
        pass,
        error: null,
        latencyMs: Date.now() - start,
      });

      const icon = pass ? "✓" : "✗";
      console.log(
        `  ${icon} ${Date.now() - start}ms — expected: ${seed.expectedMatch ?? "null"}, actual: ${actualMatch ?? "null"}`,
      );
    } catch (e) {
      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        extracted: seed.extracted,
        candidates: seed.candidates,
        expectedMatch: seed.expectedMatch,
        actualMatch: null,
        pass: false,
        error: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - start,
      });

      console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    __dirname,
    `results-entity-resolution-${timestamp}.json`,
  );

  const report = {
    runAt: new Date().toISOString(),
    model: DEFAULT_MINI_MODEL,
    passed,
    failed: total - passed,
    total,
    results,
  };

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
  console.log(`${passed}/${total} passed`);

  if (passed < total) {
    process.exit(1);
  }
}

main();
