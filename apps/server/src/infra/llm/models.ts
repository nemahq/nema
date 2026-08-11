// Vertex 카탈로그의 가장 낮은 등급(legacy/apps/server/src/infra/llm/model-catalog.ts
// 참고). task별로 상수를 따로 둬 독립적으로 튜닝하되(prompts/가 독립적으로 튜닝되는
// 것과 같은 이유), 멀티 프로바이더 카탈로그·task별 라우팅은 아직 안 들인다 — task가
// 더 늘거나 프로바이더가 갈리면 그 legacy 패턴으로 확장한다.
export const DIGEST_GENERATION_MODEL = "gemini-3.1-flash-lite";
export const STATEMENT_GENERATION_MODEL = "gemini-3.1-flash-lite";
