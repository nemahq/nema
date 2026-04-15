// 실행: pnpm tsx apps/server/src/eval/eval-entity-extraction.ts

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "@server/env";
import { DEFAULT_MINI_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import {
  buildEntityExtractionMessage,
  ENTITY_EXTRACTION_SYSTEM_PROMPT,
  EntityExtractionSchema,
} from "@server/prompts/entity-extraction";

import { ENTITY_EXTRACTION_SEEDS } from "./seed-data-entity-extraction";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../.."));

interface EntityResult {
  type: string;
  name: string;
  nameEn: string;
}

interface EvalResult {
  id: string;
  category: string;
  description: string;
  input: string;
  output: EntityResult[] | null;
  error: string | null;
  missingExpected: string[];
  forbiddenFound: string[];
  pass: boolean;
  latencyMs: number;
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function checkResult(
  entities: EntityResult[],
  seed: (typeof ENTITY_EXTRACTION_SEEDS)[number],
): { missingExpected: string[]; forbiddenFound: string[] } {
  const extractedNames = entities.map((e) => normalize(e.name));

  const missingExpected = seed.expected
    .filter((exp) => {
      const match = entities.find(
        (e) => normalize(e.name) === normalize(exp.name) && e.type === exp.type,
      );
      return !match;
    })
    .map((e) => `${e.type}:${e.name}`);

  const forbiddenFound = seed.forbidden.filter((f) =>
    extractedNames.some(
      (name) => name === normalize(f) || name.includes(normalize(f)),
    ),
  );

  return { missingExpected, forbiddenFound };
}

async function main() {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  const provider = new OpenAiProvider({ apiKey, model: DEFAULT_MINI_MODEL });
  const results: EvalResult[] = [];

  for (const seed of ENTITY_EXTRACTION_SEEDS) {
    console.log(`[${seed.id}] ${seed.category} — 실행 중...`);
    const start = Date.now();

    try {
      const { entities } = await provider.generateStructured({
        schema: EntityExtractionSchema,
        schemaName: "entity_extraction",
        systemPrompt: ENTITY_EXTRACTION_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildEntityExtractionMessage(seed.input) },
        ],
      });

      const { missingExpected, forbiddenFound } = checkResult(entities, seed);
      const pass = missingExpected.length === 0 && forbiddenFound.length === 0;

      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        input: seed.input,
        output: entities,
        error: null,
        missingExpected,
        forbiddenFound,
        pass,
        latencyMs: Date.now() - start,
      });

      const icon = pass ? "✓" : "✗";
      console.log(
        `  ${icon} ${Date.now() - start}ms — entities: ${entities.map((e) => e.name).join(", ") || "(empty)"}`,
      );
      if (missingExpected.length > 0) {
        console.log(`    missing: ${missingExpected.join(", ")}`);
      }
      if (forbiddenFound.length > 0) {
        console.log(`    forbidden: ${forbiddenFound.join(", ")}`);
      }
    } catch (e) {
      results.push({
        id: seed.id,
        category: seed.category,
        description: seed.description,
        input: seed.input,
        output: null,
        error: e instanceof Error ? e.message : String(e),
        missingExpected: [],
        forbiddenFound: [],
        pass: false,
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
    `results-entity-extraction-${timestamp}.json`,
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
}

main();
