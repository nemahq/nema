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
| Split | mini | 경계 판단, 낮은 복잡도 |
| Entity 추출 | mini | NER, 재동기화로 복구 가능 |
| Metadata | mini | 사용자 노출되나 복잡도 중간 |
| 세션 제목 | nano | 한 줄 생성, 사용자가 직접 수정 가능 |

## Tier → 모델

| Tier | 기본 모델 | 환경변수 오버라이드 |
|------|----------|-------------------|
| standard | gpt-5 | `LLM_MODEL_STANDARD` |
| mini | gpt-5-mini | `LLM_MODEL_MINI` |
| nano | gpt-5-nano | `LLM_MODEL_NANO` |

환경변수는 같은 프로바이더 내 모델 교체용 (예: `gpt-5` → `gpt-5.1`). 프로바이더 변경(예: OpenAI → Anthropic)은 `models.ts`에서 해당 tier의 구현체를 교체해야 한다.

## 확장 여지

현재 3-tier로 충분하나, 제품이 단순 검색/생성을 넘어 사용자의 지식을 "사고"해야 하는 기능으로 확장될 경우 reasoning 모델 기반의 premium tier를 고려할 수 있다.

- 교차 문서 종합 — 여러 문서를 읽고 multi-hop 추론으로 분석
- 능동적 인사이트 — 저장 시점에 기존 지식과의 모순/연관성 발견
- 지식 베이스 재구조화 — 전체 맥락을 파악하고 태그/구조 자동 재편성
