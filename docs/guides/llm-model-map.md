# LLM 모델 매핑

동작별 모델 tier 배정과 판단 기준. 코드 상 매핑은 `apps/server/src/infra/llm/models.ts`.

## 판단 기준

품질 우선. 비용보다 안정성을 우선한다.

| 축 | 설명 |
|---|------|
| 오류 영향도 | 틀렸을 때 얼마나 치명적이고 복구 가능한가 |
| 작업 복잡도 | 얼마나 깊은 추론/맥락 이해가 필요한가 |
| 사용자 노출 | 결과물을 사용자가 직접 보는가 |

## 동작별 매핑

| 동작 | Tier | 근거 |
|------|------|------|
| Drafting | standard | 사용자 직접 노출 + 장문 생성 |
| Retrieval | standard | 사용자 직접 노출 + RAG 합성 |
| Judgment | standard | 오류 시 데이터 손실 + 비교/병합 복잡도 |
| Intent 분류 | mini | 4지선다 분류, 낮은 복잡도 |
| Split | standard | 진술이 검색·관계의 입력 — 추출 오류가 하류 전체로 전파 (코드: `extractStatements`) |
| Entity 추출 | (미구현) | NER로 계획됐으나 현재 별도 모델 호출 없음 — 도입 시 tier 재평가 |
| Metadata | mini | 사용자 노출되나 복잡도 중간 |
| 세션 제목 | nano | 한 줄 생성, 사용자가 직접 수정 가능 |
| 질의 구조화 | mini | 검색어를 의미부 + 시간 토큰으로 가르기, 검색 경로라 싸고 빠르게 (코드: `structureQuery`) |

## Tier → 모델

tier 기본값은 프로바이더 무관이다 — override 경로와 같은 `createProviderForModel` + `MODEL_CATALOG`로 조립되므로, 각 tier가 OpenAI·Anthropic·Google 어느 모델이든 가리킬 수 있다. 해석은 `resolveTierModelIds`(`models.ts`)가 한다.

| 환경 | standard | mini | nano | 비고 |
|------|----------|------|------|------|
| 프로덕션 | gpt-5 | gpt-5-mini | gpt-5-nano | **하드 lock** — `LLM_MODEL_*` env를 무시하고 커밋값 강제 |
| 로컬·스테이징 | gemini-3.5-flash | gemini-3.1-flash-lite | gemini-3.1-flash-lite | 저렴한 Google 기본값 (env 미설정 시) |

- 비프로덕션은 `LLM_MODEL_STANDARD/MINI/NANO`로 tier를 **어느 프로바이더 모델로든** 덮을 수 있다 (카탈로그 등록 모델).
- 프로덕션은 env를 신뢰하지 않는다 — `APP_ENV === "production"`이면 프로바이더-스왑을 코드 레벨에서 무시하고 위 커밋값을 강제한다. Railway env 오설정으로도 프로덕션이 안 흔들린다.
- 비프로덕션 기본이 된 Google 모델의 키가 없으면 `providers.ts`가 커밋된 OpenAI 기본값으로 폴백한다(부팅 보호). 실제 resolve 결과는 dev 패널에서 확인한다.

## dev 패널 — 런타임 모델 스위칭

`/dev` 하니스의 **모델** 탭(프로덕션에서는 경로 자체가 안 뜸)에서 재배포 없이 라우팅을 만진다:

- **프리셋** — `all-nano`(전 tier를 nano로, 가장 싸게) ↔ `real-tiers`(tier 그대로) 전환. 현재 활성 프리셋과 각 tier의 실제 resolve 모델을 표시한다.
- **task별 override** — 9개 LLM 동작마다 `MODEL_CATALOG` 전체(Google 포함)에서 드롭다운으로 모델을 고른다. override는 tier 기본보다 우선하며, "tier 기본"을 고르면 해제된다. 못 쓰는 모델(키 부재·미배선)은 set 시점에 거절돼 토스트로 알린다.

override는 메모리 전용이라 서버 재시작이면 초기화된다(커밋된 seed 배치로 복귀).

## 모델 교체·이식성 (eval / 무료 크레딧)

엔진 성능 측정 단계에서는 Vertex(Gemini) 무료 크레딧으로 비용 없이 돌릴 수 있다. eval 스크립트는 `EVAL_LLM_MODEL` 환경변수로 측정 대상 모델을 바꾼다 — 미설정이면 prod 기본(`gpt-5` standard)과 동일. 모델 id는 `MODEL_CATALOG`로 검증되고, `createProviderForModel`(`infra/llm/model-factory.ts`)이 프로바이더를 자동 선택한다.

```
EVAL_LLM_MODEL=gemini-3.5-flash GEMINI_VERTEX_PROJECT=<gcp-project> pnpm tsx apps/server/src/eval/statement-engine/run-extraction.ts
```

Vertex 인증은 ADC(`gcloud auth application-default login`)를 쓴다. `GEMINI_VERTEX_PROJECT`가 있으면 Vertex, 없고 `GEMINI_API_KEY`만 있으면 AI Studio 경로다. ADC는 클라이언트 생성이 아니라 첫 호출에서 검증되므로, 미인증·만료면 측정 도중 auth 에러로 표면화된다 — 실행 전 `gcloud auth application-default login` 상태를 확인한다.

### 분리선 — 모델 무관 vs 모델 종속

무료 크레딧으로 안전하게 옮길 수 있는 범위는 "모델에 종속되지 않는 작업"이다.

| 구분 | 내용 | 무료 단계 |
|------|------|----------|
| 모델 무관 | 파이프라인·청킹·retrieval 배선·스키마·dedup·비회귀 + 규칙 기반 프롬프트 | Gemini로 자유롭게 |
| 모델 종속 | 프롬프트 미세조정, `judgeRelations`의 `confident` 임계, effort/timeout | prod 모델로 최종 확정 |

프롬프트 본문(시스템 프롬프트·규칙·few-shot)은 모델 중립으로 설계돼 있어 교체해도 대부분 그대로 이식된다. 깨지는 건 프롬프트가 아니라 출력 분포에 맞춰 잡은 소수의 보정값뿐이다.

### 하지 말 것

- 무료(Gemini) 단계에서 잡은 **모델 종속 숫자(임계·effort·timeout)를 prod 기준으로 확정**하지 말 것 — prod 모델로 재측정 후 고정한다.
- **judge는 Claude 고정**(`eval/statement-engine/judge.ts`) — 엔진과 같은 계열로 채점하면 self-preference 편향이 생긴다.
- **임베딩은 Voyage 유지** — 프로바이더를 바꾸면 벡터 공간이 달라져 전량 재인덱싱 + retrieval 지표 비교 불가. retrieval 품질 개선 단계가 아니면 건드리지 않는다.

## 확장 여지

현재 3-tier로 충분하나, 제품이 단순 검색/생성을 넘어 사용자의 지식을 "사고"해야 하는 기능으로 확장될 경우 reasoning 모델 기반의 premium tier를 고려할 수 있다.

- 교차 문서 종합 — 여러 문서를 읽고 multi-hop 추론으로 분석
- 능동적 인사이트 — 저장 시점에 기존 지식과의 모순/연관성 발견
- 지식 베이스 재구조화 — 전체 맥락을 파악하고 태그/구조 자동 재편성
