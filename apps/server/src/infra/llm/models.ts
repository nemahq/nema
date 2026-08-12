// task가 다이제스트 생성 하나뿐인 지금은 멀티 프로바이더 카탈로그·task별 라우팅을
// 통째로 들이지 않는다(legacy/apps/server/src/infra/llm/model-catalog.ts 참고) —
// task가 늘면 그 legacy 패턴으로 확장한다.

// 잠정값 — eval 세션이 11개 케이스(빠짐/지어냄/유형 오분류)로 재는 중이다. 결과는
// 별도로 반영된다.
export const DIGEST_GENERATION_MODEL_OPENAI = "gpt-5.6-terra";

// Vertex 카탈로그의 가장 낮은 등급. GCP 무료 크레딧을 로컬 작업에 태우기 위한
// 오버라이드 경로에서만 쓴다(DIGEST_GENERATION_LLM_PROVIDER=vertex).
export const DIGEST_GENERATION_MODEL_GEMINI = "gemini-3.1-flash-lite";

// OpenAI Responses API의 구조화 출력(zodTextFormat)이 요구하는 스키마 이름.
export const DIGEST_GENERATION_SCHEMA_NAME = "digest_generation";
