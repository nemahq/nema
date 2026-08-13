import { getEnv } from "@server/env";

// production만 접미사가 없다. local·staging은 같은 스테이징 클러스터를
// 공유한다(로컬이 별도 Qdrant 인스턴스를 안 띄우는 지금 관행과 같다).
function suffix(): string {
  return getEnv().APP_ENV === "production" ? "" : "-staging";
}

// 벡터 공간(=컬렉션) 레지스트리. 새 임베딩 대상이 생기면 여기 한 줄만 추가한다 —
// env var는 늘리지 않는다(컬렉션마다 QDRANT_COLLECTION_* 변수를 늘리면 스페이스가
// 늘 때마다 Railway·로컬 시크릿을 매번 건드려야 한다).
export const VECTOR_SPACE_COLLECTION = {
  digest: `digests${suffix()}`,
} as const;

export type VectorSpace = keyof typeof VECTOR_SPACE_COLLECTION;
