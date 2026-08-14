// task별 모델 id 단일 출처. model-catalog.ts·task-routing.ts가 이 상수를 등록·참조한다.

// 잠정값 — eval 세션이 11개 케이스(빠짐/지어냄/유형 오분류)로 재는 중이다. 결과는
// 별도로 반영된다.
export const DIGEST_GENERATION_MODEL_OPENAI = "gpt-5.6-terra";

// Vertex 카탈로그의 가장 낮은 등급. GCP 무료 크레딧을 로컬 작업에 태우기 위한
// 오버라이드 경로에서만 쓴다(DIGEST_GENERATION_LLM_PROVIDER=vertex).
export const DIGEST_GENERATION_MODEL_GEMINI = "gemini-3.1-flash-lite";

// 관계 판정은 정리와 같은 모델로 시작한다(task-routing 참고) — 판정이 더 가벼운 건
// 맞지만 어느 등급까지 내려도 되는지 잴 자료가 없다. 따로 재서 내릴 때 상수를 가르고
// MODEL_CATALOG에 등록한다.

// 겹치는 카드 걸러내기도 같은 모델로 시작한다. 짧고 잦아 단가가 곧 총액이 되는 자리라
// 내리고 싶은 유인이 크지만, 잘못 지운 카드는 사용자가 그런 판단이 있었다는 사실조차
// 모른 채 사라져 되돌릴 수 없다 — 걸러낸 목록이 로그에 쌓여 과하게 지우는지를 잰 뒤 내린다.

// OpenAI Responses API의 구조화 출력(zodTextFormat)이 요구하는 스키마 이름.
export const DIGEST_GENERATION_SCHEMA_NAME = "digest_generation";
export const RELATION_JUDGMENT_SCHEMA_NAME = "relation_judgment";
export const DIGEST_DEDUP_SCHEMA_NAME = "digest_dedup";
