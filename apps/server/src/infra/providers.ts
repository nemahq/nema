import { getEnv } from "@server/env";
import type { EmbeddingProvider } from "@server/infra/embedding";
import { createVoyageProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import { createNeo4jStore } from "@server/infra/graph";
import type { TieredLlm } from "@server/infra/llm/models";
import { createTieredLlm } from "@server/infra/llm/models";
import type { VectorStore } from "@server/infra/vector";
import { createQdrantStore } from "@server/infra/vector";

export interface Providers {
  llm: TieredLlm;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
  graphStore: GraphStore;
}

let cached: Providers | undefined;

export function getProviders(): Providers {
  if (cached) {
    return cached;
  }

  const env = getEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for chat");
  }
  if (!env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is required for chat");
  }
  if (!env.QDRANT_URL || !env.QDRANT_API_KEY) {
    throw new Error("QDRANT_URL and QDRANT_API_KEY are required for chat");
  }

  cached = {
    llm: createTieredLlm({
      apiKey: env.OPENAI_API_KEY,
      modelStandard: env.LLM_MODEL_STANDARD,
      modelMini: env.LLM_MODEL_MINI,
      modelNano: env.LLM_MODEL_NANO,
    }),
    embedding: createVoyageProvider({ apiKey: env.VOYAGE_API_KEY }),
    vectorStore: createQdrantStore(),
    graphStore: createNeo4jStore(),
  };

  return cached;
}
