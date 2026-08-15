import { getEnv } from "@server/env";

export type VectorSpace = "digest";

// production만 접미사가 없다. local·staging은 같은 스테이징 클러스터를
// 공유한다(로컬이 별도 Qdrant 인스턴스를 안 띄우는 지금 관행과 같다).
function suffix(): string {
  return getEnv().APP_ENV === "production" ? "" : "-staging";
}

// 벡터 공간(=컬렉션) 레지스트리. 새 임베딩 대상이 생기면 여기 한 줄만 추가한다 —
// env var는 늘리지 않는다(컬렉션마다 QDRANT_COLLECTION_* 변수를 늘리면 스페이스가
// 늘 때마다 Railway·로컬 시크릿을 매번 건드려야 한다).
//
// 함수로 둔다 — 모듈 최상단 상수로 두면 import 시점에 getEnv()가 불리는데, ESM은
// import를 전부 평가한 뒤에야 index.ts의 loadEnv()가 돈다. 상수였을 때 이 순서
// 위반으로 부팅이 죽었다(2026-08-13 staging incident).
export function collectionNameFor(space: VectorSpace): string {
  const names: Record<VectorSpace, string> = {
    digest: `digests${suffix()}`,
  };
  return names[space];
}
