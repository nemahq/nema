import { getEnv } from "@server/env";

import type { EmbeddingProvider } from "./embedding-provider";
import { createVoyageProvider } from "./voyage-provider";

let cached: EmbeddingProvider | undefined;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cached) {
    cached = createVoyageProvider({ apiKey: getEnv().VOYAGE_API_KEY });
  }
  return cached;
}
