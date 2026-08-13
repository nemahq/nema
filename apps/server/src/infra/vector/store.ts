import { createQdrantClient } from "./qdrant-client";
import { createQdrantStore } from "./qdrant-store";
import type { VectorStore } from "./vector-store";

let cached: VectorStore | undefined;

export function getVectorStore(): VectorStore {
  if (!cached) {
    cached = createQdrantStore(createQdrantClient());
  }
  return cached;
}
