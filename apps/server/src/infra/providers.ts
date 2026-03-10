import { getEnv } from "@server/env";
import type { EmbeddingProvider } from "@server/infra/embedding";
import { createVoyageProvider } from "@server/infra/embedding";
import type { GraphStore } from "@server/infra/graph";
import { createNeo4jStore } from "@server/infra/graph";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import type { VectorStore } from "@server/infra/vector";
import { createQdrantStore } from "@server/infra/vector";

export interface Providers {
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  vectorStore: VectorStore;
  graphStore: GraphStore;
}

let cached: Providers | undefined;

export function getProviders(): Providers {
  if (cached) return cached;

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
    llm: new OpenAiProvider({ apiKey: env.OPENAI_API_KEY }),
    embedding: createVoyageProvider({ apiKey: env.VOYAGE_API_KEY }),
    vectorStore: createQdrantStore(),
    graphStore: createNeo4jStore(),
  };

  return cached;
}
