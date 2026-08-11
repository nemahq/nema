// Vertex 카탈로그의 가장 낮은 등급(legacy/apps/server/src/infra/llm/model-catalog.ts
// 참고). task가 다이제스트 생성 하나뿐인 지금은 멀티 프로바이더 카탈로그·task별 라우팅을
// 통째로 들이지 않는다 — task가 늘면 그 legacy 패턴으로 확장한다.
export const DIGEST_GENERATION_MODEL = "gemini-3.1-flash-lite";
