import { QdrantClient } from "@qdrant/js-client-rest";

import { getEnv } from "@server/env";

export function createQdrantClient(): QdrantClient {
  const { QDRANT_URL, QDRANT_API_KEY } = getEnv();
  return new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
}

export type { QdrantClient };
