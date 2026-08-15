import { collectionNameFor, type VectorSpace } from "./collections";
import { createQdrantClient } from "./qdrant-client";
import { createQdrantStore } from "./qdrant-store";
import type { VectorStore } from "./vector-store";

// 클라이언트는 스페이스와 무관하게 하나만 있으면 된다 — 컬렉션은 store별로 갈릴 뿐
// 연결 자체는 클러스터 하나다.
let client: ReturnType<typeof createQdrantClient> | undefined;
const stores = new Map<VectorSpace, VectorStore>();

export function getVectorStore(space: VectorSpace = "digest"): VectorStore {
  if (!client) {
    client = createQdrantClient();
  }
  let store = stores.get(space);
  if (!store) {
    store = createQdrantStore(client, collectionNameFor(space));
    stores.set(space, store);
  }
  return store;
}
