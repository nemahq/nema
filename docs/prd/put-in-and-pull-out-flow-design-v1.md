# Nema 구조화 엔진 — End-to-End 흐름 설계

## 목적

사용자 입력이 구조화된 지식으로 저장(Put-in)되고, 저장된 지식을 검색하여 답변(Pull-out)하기까지의 전체 흐름을 단계별로 명세한다. 각 단계에서 누가(Frontend, Backend, LLM, DB) 무엇을 하고, 어떤 데이터가 오가는지를 확정해서 하위 레이어(LLM 추상화, 임베딩 파이프라인, API 통합) 설계의 기반을 만든다.

## 목차

1. [구성 요소 정의](#1-구성-요소-정의) — 흐름에 참여하는 주체와 책임 경계
2. [Phase 1: 드래프팅](#2-phase-1-드래프팅) — Intent Router → put-in 판정 → LLM 본문 정제 → body만 표시 → 수정/pull-out/저장/취소. 드래프트는 항상 단일 문서
3. [Phase 2: 저장](#3-phase-2-저장) — 저장 트리거 → 멀티 토픽 분리 → 유사 검색 → 메타 생성 + create/update(주제 범위 게이트) → merge 후 재분리 → DB 기록
4. [Phase 3: 후처리 파이프라인](#4-phase-3-후처리-파이프라인) — 배치 인제스천: 임베딩 생성 (Qdrant) + 그래프 노드/엣지 생성 (Neo4j). 완료 후 pending 순환
5. [상태 및 세션 관리](#5-상태-및-세션-관리) — 대화 상태 유지, 드래프트 임시 저장, Phase 전환 시점, 대화 이력(raw_input) 저장
6. [Pull-out 흐름](#6-pull-out-흐름) — 저장된 지식 검색/조회의 E2E 흐름 (Put-in과 대칭)

---

## 1. 구성 요소 정의

이 흐름에 참여하는 주체와 각각의 책임 경계.

### 주체별 역할

| 주체 | 정체 | 책임 | 하지 않는 것 |
|---|---|---|---|
| **User** | 사용자 | 텍스트 입력, 저장/취소 트리거 (자연어 또는 인라인 버튼), 예외적으로 채팅 수정 요청 | 구조화 판단, 분류, 메타 필드 직접 편집 |
| **Frontend** | React (Vite) | UI 렌더링, 사용자 입력 수집, 드래프트 카드 표시 (인라인 저장/취소 버튼), pull-out 답변 버블 표시 | LLM 직접 호출, DB 직접 접근 |
| **Backend** | Fastify + tRPC | 흐름 오케스트레이션, 외부 서비스 호출 순서 제어, 입력 검증, 유사 문서 백그라운드 검색 | 구조화 판단 (LLM 영역), 데이터 영속 (DB 영역) |
| **LLM** | GPT-4o (교체 가능) | Intent 판단 + 검색 쿼리 생성 (Intent Router + Query Planner), 본문 정제 (Phase 1), title/tags/summary 생성 + create/update 판단 + 기존 문서와 통합 재구성 (Phase 2), 검색 결과 기반 답변 생성 (Pull-out) | 데이터 저장, 검색, 상태 유지 |
| **Supabase** | PostgreSQL | 구조화된 문서 저장 — source of truth (본문 + 메타 필드 각각 독립 컬럼) | 의미 검색, 관계 탐색 |
| **Qdrant** | Vector DB | 임베딩 벡터 저장, 의미 유사도 검색 | 원본 저장, 관계 탐색 |
| **Neo4j** | Graph DB | 엔티티 간 관계 저장, 관계 탐색 (multi-hop) | 원본 저장, 의미 검색 |

### 통신 구조

#### 프로토콜

| 구간 | 프로토콜 |
|---|---|
| User ↔ Frontend | 브라우저 UI |
| Frontend ↔ Backend | tRPC (WebSocket or HTTP) |
| Backend → LLM | OpenAI API (HTTPS) |
| Backend → Supabase | Supabase Client SDK (HTTPS) |
| Backend → Qdrant | Qdrant REST API (HTTPS) |
| Backend → Neo4j | Neo4j Driver (Bolt) |
| Backend → Embedding API | Voyage AI API (HTTPS) |

#### 호출 방식 (사용자 대기 여부 기준)

| 구분 | 대상 | 의미 |
|---|---|---|
| **Blocking** | Intent Router + Query Planner LLM | 사용자가 응답을 기다림. Intent 판정 결과에 따라 후속 흐름(put-in 또는 pull-out)이 결정됨 |
| **Blocking** | Phase 1 LLM | 사용자가 응답을 기다림. 본문 정제 결과를 받아야 드래프트 카드 표시 가능 |
| **Blocking** | Pull-out 답변 생성 LLM | 사용자가 응답을 기다림. 검색 결과 기반 답변을 받아야 채팅 버블 표시 가능 |
| **Non-blocking** | Phase 2 전체 (LLM, Supabase), Embedding API, Qdrant, Neo4j | 사용자에게 먼저 입력을 반환하고 백그라운드에서 처리. 저장 큐 UI로 상태 표시 |

### 데이터 저장 원칙

- **단일 책임**: 각 저장소는 고유 역할만 수행. 관계 정보는 Neo4j에만, 벡터는 Qdrant에만
- **Supabase가 source of truth**: 문서 원본 + 메타데이터. 나머지 저장소는 파생 데이터
- **파생 데이터 재생성 가능**: Qdrant, Neo4j 데이터는 Supabase 원본으로부터 재생성 가능해야 함

### 인제스천 전 문서 검색 (폴백)

임베딩/그래프 저장은 Non-blocking이므로, 저장 직후 해당 문서가 벡터 검색에 잡히지 않는 구간이 존재한다. 이때 Supabase에는 이미 본문 + 메타 필드가 저장 완료된 상태이므로, **별도 임시 저장소 없이 Supabase 메타 필드(tags, summary)로 폴백 검색**한다. 상세 흐름은 Section 6(Pull-out 흐름)에서 다룬다.

### 향후 고려사항

- **Source of truth 백업 전략**: Supabase가 유일한 원본 저장소이므로 단일 장애점(SPOF). 사용자가 쌓은 맥락이 제품의 핵심 가치인 만큼, 사용자 수 증가 시 백업 방안(Point-in-Time Recovery, 주기적 스냅샷 등) 필수
- **벡터/그래프 DB 용량**: 문서 원본(Supabase)보다 Qdrant(Free 1GB), Neo4j(Free tier 노드 제한)가 먼저 한계에 도달. 사용자 수 증가 시 유료 전환 또는 셀프호스팅 검토 필요
- **MCP / CLI 확장**: 모든 오케스트레이션 로직이 Backend(tRPC)에 집중되어 있으므로, 프레젠테이션 레이어 추가로 대응 가능. put-in/pull-out 두 tool 노출, 드래프트는 텍스트/tool response로 대체, `--sync` 모드(Phase 2 완료까지 대기) 옵션 등. 현재 flow 변경 불필요
- **문서 관리 뷰**: tags 기반 필터링 + 정렬로 문서 목록 제공. 롤백(버전 히스토리 전제), 스페이스 구분, 개괄 보기 목적. AI 자동 정리 철학과 충돌하지 않음 — 입력 시점은 AI가 정리하되, 조회 시점에서는 사용자에게 구조를 투명하게 보여주는 것

---

## 2. Phase 1: 드래프팅

사용자 입력을 정제된 본문으로 변환하는 대화형 단계. Phase 1에서는 body만 생성하며, title/tags/summary는 Phase 2(저장 시점)에서 기존 지식 베이스 컨텍스트와 함께 생성한다.

### 흐름

```
0. User → Frontend: 텍스트 입력
   "오늘 프론트 시니어 봤는데 기술은 ㅇㅋ 근데 말을 좀 못함"

   Frontend → Backend → LLM: Intent Router + Query Planner
   → intent: "put-in" → Phase 1 진입

1. Backend → LLM: 구조화 요청 (시스템 프롬프트 + 사용자 입력)

2. LLM → Backend: 정제된 본문 응답
   {
     "body": "Interviewed a senior frontend candidate. Technical skills were adequate. Communication was somewhat lacking.",
     "session_title": "프론트엔드 시니어 면접 피드백"  // 첫 호출에서만 생성
   }

3. Backend → Frontend: 드래프트 전달
   Backend → 유사 문서 검색 (백그라운드, Non-blocking, body 텍스트 기반)

4. Frontend → User: 드래프트 카드 표시
   - 정제된 body만 표시
   - 인라인 버튼: 저장, 취소
   - 유사 문서 검색 완료 시 → 드래프트 카드 옆에 관련 문서 힌트 표시

5. [드래프트 활성 중 — 반복 가능]
   User → Frontend: 채팅 입력
   → Intent Router 판정:
     수정 요청 ("좀 더 자세히 써줘", "톤이 너무 딱딱해")
       → 진행 중인 유사 문서 검색 abort
       → 1~4 반복 (이전 드래프트 + 수정 요청을 LLM에 전달)
     pull-out ("저번에 본 시니어는 어땠지?")
       → Pull-out 흐름 (Section 6) → 채팅 버블로 답변, 드래프트 카드 유지
     저장 ("저장해", 저장 버튼 클릭)
       → Phase 2로 전환
     취소 ("취소해줘", 취소 버튼 클릭)
       → 드래프트 폐기, 입력 대기 상태로 복귀
```

### Phase 1 LLM의 경계

| 아는 것 | 모르는 것 |
|---|---|
| 정제 규칙 (본문 품질 기준) | 사용자의 기존 문서 |
| 현재 대화 맥락 (이전 드래프트 + 수정 요청) | 기존 태그 목록, DB 상태 |

Phase 1 LLM은 **본문 정제만** 수행한다. title, tags, summary 생성과 기존 지식 베이스 인식, create/update 판단은 전적으로 Phase 2의 영역이다.

단, **유사 문서 조기 인지**는 LLM이 아닌 Backend가 담당한다. 드래프트 생성 후 Backend가 백그라운드로 body 텍스트 기반 유사 문서를 검색하여 Frontend에 힌트로 전달한다. 이를 통해 LLM 경계는 유지하면서 사용자는 저장 전에 이미 관련 문서의 존재를 파악할 수 있다.

### Phase 1 드래프트 출력

| 필드 | 타입 | 설명 |
|---|---|---|
| `body` | string | 정제된 본문. 원래 의미 100% 보존 (강도 포함). 사용자가 말하지 않은 내용 추가 금지 |
| `session_title` | string | 세션 제목 (첫 번째 호출에서만 생성, 수정 사이클에서는 미갱신) |

title, tags, summary는 Phase 2에서 기존 지식 베이스 컨텍스트(기존 태그 풀, 유사 문서)와 함께 생성한다. Phase 1 시점에 DB를 모르는 상태에서 생성하는 것보다 품질이 높아진다.

> **결정 기록: Phase 1 출력을 body만으로 축소**
>
> 기존 설계(맥락 2)에서는 Phase 1에서 title, tags, summary, body를 모두 생성했으나 body만 생성하도록 변경.
>
> - **근거**: 사용자는 정제된 본문만 확인하면 되고, 나머지 메타 필드는 관심사가 아님. 저장 시점에 기존 지식 베이스 컨텍스트를 활용하면 메타 필드 품질도 더 높아짐
> - **이점**: Phase 1 LLM 호출이 단순해지고, 드래프트 카드 UI도 body만 표시하면 됨
> - **diff 리뷰와 연계**: 향후 diff 리뷰 플로우가 생기면 title, tags 등이 어떻게 반영되었는지 사용자가 저장 후 확인 가능

> **결정 기록: `category` 필드 — 스키마 선반영, 그룹핑 UI는 추후**
>
> 기존 설계(맥락 2)에서는 `category`(분류 경로, e.g. `hiring/interview-feedback`)를 포함했으나, 맥락 3에서 제외 → 맥락 4 논의를 거쳐 **스키마에 선반영하되 그룹핑 로직/프롬프트/뷰는 추후 구현 단계에서 설계**하기로 결정.
>
> - **원래 목적**: 폴더 트리 UI에서 문서를 계층 탐색하기 위한 경로
> - **선반영 근거**: 문서 관리 뷰(개괄 보기, 스페이스 구분)가 필요하다는 판단. 나중에 백필하는 것보다 Phase 2 LLM이 저장 시점에 함께 채우는 것이 데이터 품질에 유리
> - **추후 구현**: 그룹핑 로직, LLM 프롬프트(category 생성 규칙), 그룹핑 뷰 UI는 실제 구현 단계에서 설계
> - **tags와의 관계**: tags는 다대다 분류, category는 단일 계층 경로. 용도가 다르므로 공존 가능

### 수정 사이클

첫 드래프트의 품질이 핵심이다. 프롬프트 품질이 충분하면 대부분의 사용자는 수정 없이 바로 저장하게 된다. 수정은 예외적 상황을 위한 안전망이며, 채팅으로만 수행한다.

수정 요청 시 Backend는 **이전 body + 수정 요청**을 함께 LLM에 전달하고, LLM은 수정이 반영된 새 body를 응답한다.

수정 예시:
- 톤 조정: "좀 더 가볍게 써줘", "격식체로 바꿔"
- 내용 보완: "기술 면접에서 시스템 설계도 물어봤다는 것도 추가해"
- 분리 요청 없음: 드래프트는 항상 단일 문서. 멀티 토픽 분리는 Phase 2에서 Backend가 처리

---

## 3. Phase 2: 저장

사용자가 저장을 트리거한 시점부터 Supabase에 문서가 기록되기까지의 흐름. Phase 1에서 생성된 body를 바탕으로 메타 필드(title, tags, summary) 생성, 멀티 토픽 분리, 유사 문서 검색, create/update 판단을 수행한다.

MVP에서 Phase 2는 **사용자 관점에서 Non-blocking**이다. 저장 트리거 즉시 새 입력(Phase 1)을 시작할 수 있으며, Phase 2는 백그라운드에서 처리된다.

### 흐름

```
1. 저장 트리거 (자연어 "저장해" 또는 인라인 저장 버튼)
   → Frontend: 드래프트 카드 사라짐 → 저장 큐 UI에 항목 추가 (로딩 상태)
   → Frontend: 채팅 입력 즉시 활성화 (새 입력 시작 가능)

2. Frontend → Backend: 확정된 body 전달 (저장 큐에 추가)

3. Backend → LLM: 멀티 토픽 분리 판단
   입력: body
   출력: 단일 문서 유지 또는 분리된 body 목록
   (대부분은 단일 문서. 명확히 독립적인 토픽이 2개 이상일 때만 분리)

4. [이하 문서별로 반복 — 분리되지 않았으면 1회]

   4-1. Backend: 유사 문서 검색 결과 확보
        - Phase 1 검색 완료 + 분리 안 됨: 결과 재사용 (검색 절약)
        - Phase 1 검색 미완료 (즉시 저장 등): Phase 2에서 직접 검색
        - 멀티 토픽 분리됨: 분리된 각 body별로 Phase 2에서 직접 검색
        저장 버튼은 Phase 1 검색 완료 후 활성화하여 대부분 재사용 경로를 탐

   4-2. Backend → Supabase: 기존 태그 풀 조회

   4-3. Backend → LLM: 메타 필드 생성 + create/update 판단
        입력: body + 유사 문서 목록 + 기존 태그 풀
        판단: 유사 문서와 주제 범위가 일치하는가?
          → 주제 범위 밖 또는 유사 문서 없음: create
          → 주제 범위 안 (보완/확장): update → 통합 재구성

        create 출력:
        {
          "title": "Senior Frontend Interview Feedback",
          "tags": ["hiring", "frontend", "senior", "interview"],
          "summary": "Senior frontend interview — tech skills adequate, communication somewhat lacking",
          "action": "create",
          "target_id": null
        }
        update 출력:
        {
          "title": "Senior Frontend Interview Feedback",
          "tags": ["hiring", "frontend", "senior", "interview"],
          "summary": "...",
          "action": "update",
          "target_id": "existing_doc_id",
          "merged_body": "기존 문서 + 새 body를 통합 재구성한 본문"
        }

   4-4. [update인 경우] Backend → LLM: merge 후 재분리 판단
        통합 재구성된 merged_body가 하위 주제로 분화했는지 확인
        → 단일 주제 유지: 그대로 진행
        → 하위 주제 분화: 메인 토픽 update + 분화된 토픽은 4-1부터 create로 처리
        (단계 3 멀티 토픽 분리와 동일한 로직 재사용)

   4-5. Backend → Supabase: DB 기록
        create → 새 행 삽입 (title, tags, summary, body)
        update → 기존 행 갱신 (title, tags, summary, body를 merged_body로 교체)

5. Backend → Frontend: 저장 완료 응답

6. Frontend: 저장 큐 UI 상태 전환
   성공 → 완료 표시 (일정 시간 후 자동 사라짐)
   실패 → 에러 표시 + 드래프트 복구 + 재시도 버튼

7. → Phase 3 (후처리 파이프라인) 트리거
```

### Phase 2 LLM의 경계

| 아는 것 | 모르는 것 |
|---|---|
| Phase 1에서 확정된 body | 사용자의 의도 (create vs update 선호) |
| 유사 문서 목록 (Backend가 검색해서 전달) | 임베딩/그래프 상태 |
| 기존 태그 풀 | |
| 기존 문서 원본 (update 판단 시) | |

Phase 2 LLM은 기존 지식 베이스 컨텍스트를 **Backend로부터 받아서** 판단한다. 직접 DB를 조회하지는 않는다.

### 저장 스키마 (Supabase 기록 시점)

| 필드 | 타입 | 생성 주체 | 설명 |
|---|---|---|---|
| `id` | uuid | 시스템 | 문서 고유 식별자 |
| `title` | string | Phase 2 LLM | 소프트 앵커: 3-8 단어 지향 |
| `tags` | string[] | Phase 2 LLM | 소프트 앵커: 3-7개 지향. 기존 태그 풀과 수렴 |
| `summary` | string | Phase 2 LLM | 소프트 앵커: 1-2문장 지향 |
| `body` | string | Phase 1 LLM (create) 또는 Phase 2 LLM (update 시 merged) | 정제된 본문 |
| `created_at` | timestamp | 시스템 | 최초 생성 시각 |
| `updated_at` | timestamp | 시스템 | 최종 수정 시각 |
| `user_id` | uuid | 시스템 | 소유자 (Supabase Auth) |
| `category` | string | Phase 2 LLM | 분류 경로 (e.g. `hiring/interview-feedback`). 스키마 선반영, 그룹핑 로직/뷰는 추후 구현 |
| `ingestion_status` | enum | 시스템 | `pending` (저장/수정 시) → `completed` (인제스천 완료 시) → `failed` (반복 실패 시). Phase 2에서 항상 `pending`으로 설정 |

> 소프트 앵커는 LLM 프롬프트에 수치를 명시하되 시스템 검증(validation)으로 강제하지 않는다. 숫자 없이 "적절히"로만 두면 출력 편차가 커지므로(태그 1개 ~ 15개), 앵커로 범위를 잡되 내용이 필요로 하면 초과를 허용한다.

### create/update 판단 + 문서 크기 관리

> **설계 원칙: 문서 1개 = 주제 1개**
>
> 이 등식이 깨지면 검색 품질(잘못된 문서 반환)과 토큰 효율(불필요한 맥락 소비)이 동시에 하락한다. 아래 두 단계로 이 등식을 유지한다.

**A. create/update 판단 — 주제 범위 게이트 (4-3)**

LLM이 유사 문서 목록을 받고, 새 body가 기존 문서의 **주제 범위 안에 있는지**를 기준으로 판단한다:

- **create**: 유사 문서가 없거나, 있더라도 주제 범위 밖인 경우
- **update**: 유사 문서 중 동일 주제를 다루고, 새 body가 해당 문서의 보완/확장인 경우

update 시 LLM은 기존 문서의 body와 새 body를 **통합 재구성**(단순 append가 아닌 맥락 이해 기반 재작성)한다. 향후 diff 리뷰 플로우가 추가되면 사용자가 통합 결과를 확인/수정할 수 있다.

주제 범위를 명시적 판단 기준으로 두면, 주제가 다른 내용이 기존 문서에 merge되는 것을 차단한다.

**B. merge 후 재분리 — 하위 주제 분화 감지 (4-4)**

A를 통과하여 merge했더라도, 같은 주제 내에서 반복 update로 하위 주제가 분화할 수 있다. (예: "프론트엔드 시니어 채용" → 1차 면접 피드백, 2차 면접 피드백, 최종 판단 근거)

통합 재구성 결과에 대해 LLM이 단일 주제 유지 여부를 판단한다:
- 단일 주제 유지: 정상 update
- 하위 주제 분화: 메인 토픽 update + 분화된 토픽 create (4-1부터 독립 처리)

단계 3(멀티 토픽 분리)과 동일한 로직을 재사용한다. 추가 구현 비용은 LLM 호출 1회.

### 멀티 토픽 분리

사용자 입력이 독립적인 2개 이상의 주제를 포함할 때 Backend가 LLM에 분리를 요청한다. 분리된 각 body는 4-1부터 독립적으로 처리된다.

- 분리 판단은 **보수적으로**: 애매하면 단일 문서 유지. 명확히 독립적인 주제일 때만 분리
- 분리된 문서 중 일부가 create, 일부가 update일 수 있음
- 분리된 문서 중 일부 저장이 실패해도 성공한 문서는 유지 (부분 실패 허용). 사용자에게는 단일 실패로 보이며, 재시도 시 실패한 문서만 다시 처리

> **소결론: 재시도 시 DB 상태 변경**
>
> 저장 실패 후 다른 저장이 먼저 완료된 상태에서 재시도하면, 유사 문서 검색 결과가 달라져 create/update 판단이 원래 시도와 다를 수 있다. 이는 문제가 아닌 정상 동작으로 취급한다 — 재시도 시점의 최신 DB 상태로 판단하는 것이 오히려 더 정확한 결과를 낸다. MVP에서 별도 처리 불필요.

### 동시 저장 처리

Phase 1(드래프팅)은 저장 중에도 새 입력을 즉시 시작할 수 있다. 단, Phase 2(저장)는 **큐로 순차 처리**한다.

```
Phase 1: 병렬 가능 — 저장 중에도 새 드래프팅 즉시 시작
Phase 2: 큐 — 앞선 저장 완료 후 다음 저장 시작
```

두 번째 저장이 첫 번째 결과를 반영한 상태에서 유사 검색 + create/update 판단을 수행하므로 충돌 없음.

### 저장 큐 UI

저장 상태를 사용자에게 보여주는 UI 영역. 드래프트 카드가 사라지면서 큐에 항목이 추가된다.

| 상태 | 표시 | 사용자 액션 |
|---|---|---|
| **로딩** | 저장 진행 중 인디케이터 | 없음 (새 입력은 가능) |
| **완료** | 완료 표시, 일정 시간 후 자동 사라짐 | 없음 |
| **실패** | 에러 표시 + 드래프트 내용 보존 | 재시도 버튼으로 Phase 2 재실행 |

실패 시 드래프트(body)를 복구할 수 있어야 한다. 복구 없이 에러만 표시하면 사용자가 처음부터 다시 작성해야 하므로.

### 향후 고려사항

- **Diff 리뷰 플로우**: 4-3/4-4(LLM 판단 + 재분리)와 4-5(DB 기록) 사이에 사용자 확인 단계 삽입. update 시 "기존 body vs merged_body" 비교, create 시 생성된 title/tags/summary 확인. 사용자가 승인하면 DB 기록, 수정 요청하면 LLM 재처리
- **Diff 리뷰 + 동시 저장**: 리뷰 도입 시 승인 대기 상태가 생김. 같은 문서를 대상으로 한 리뷰가 동시에 존재하면, 먼저 승인된 결과를 기반으로 나머지를 자동 재판단 (rebase 전략) 필요
- **버전 히스토리**: update 시 이전 body를 스냅샷으로 보존. `document_versions` 테이블 또는 저장 이벤트 로그 활용. 문서 관리 뷰에서 롤백 기능의 전제 조건. 니즈 확인 후 도입 시점 결정
- **멀티유저 소유권 모델**: MVP의 `user_id`를 확장하여 문서 단위(created_by + contributors[])와 문단 단위(블록별 author) 추적 도입. 이를 기반으로 맥락 변경 구독(특정 문서/문단의 변경 시 알림), 문단 단위 공유(문서 전체가 아닌 특정 문단만 선택하여 알림 전송) 등 협업 기능으로 확장 가능

---

## 4. Phase 3: 후처리 파이프라인

Supabase에 저장된 문서를 임베딩(Qdrant) + 그래프(Neo4j)로 변환하는 배치 처리 단계. Phase 2 완료 즉시가 아니라, 누적된 pending 문서를 배치로 처리한다.

### 왜 배치인가

- 인제스천은 외부 API 호출(임베딩 생성, 엔티티 추출)을 포함하여 처리 시간이 길다
- 건별 즉시 실행 시 인제스천 실행 중 새 저장이 들어오면 race condition 발생
- 폴백 검색(Supabase 메타 필드)이 인제스천 미완료 구간을 메워주므로 즉시성 불필요
- 배치로 묶으면 API 호출 효율도 올라감

### 인제스천 상태 관리

Supabase 문서 테이블에 `ingestion_status` 필드를 추가한다.

| 상태 | 의미 | 전환 시점 |
|---|---|---|
| `pending` | 인제스천 대기 | Phase 2 저장/수정 시 항상 설정 |
| `completed` | 인제스천 완료 | 배치 처리 성공 시 |

Phase 2가 문서를 저장/수정할 때 **항상 `pending`으로 덮어쓴다.** 인제스천 실행 중에 같은 문서가 update되면 `pending`이 유지되어 다음 배치에서 최신 버전으로 재처리된다.

### 배치 트리거

주기나 건수 기준이 아닌, **인제스천 완료 후 pending 순환** 방식.

```
Phase 2 저장 완료 → ingestion_status = pending
  → 현재 인제스천 실행 중이 아니면 배치 시작

배치 실행:
  1. pending 문서 전체 수집
  2. 임베딩 생성 (Voyage AI) → Qdrant 저장
  3. 엔티티/관계 추출 (LLM) → Neo4j 저장
  4. 성공한 문서: ingestion_status = completed
     실패한 문서: pending 유지
  5. 배치 완료 → pending 재확인
     → pending 있음: 즉시 다음 배치
     → pending 없음: 대기 (다음 Phase 2 저장이 트리거)
```

별도 스케줄러나 크론 불필요. "끝나면 밀린 거 처리"라는 단일 규칙으로 동작하며, 인제스천 중에는 새 배치를 시작하지 않으므로 race condition이 발생하지 않는다.

### 흐름

```
1. 트리거: Phase 2 저장 완료 시 pending 확인, 또는 이전 배치 완료 후 pending 확인

2. Backend → Supabase: pending 문서 수집
   SELECT * FROM documents WHERE ingestion_status = 'pending'

3. Backend → Voyage AI: 임베딩 생성 (배치 API)
   입력: 각 문서의 body
   출력: 벡터 배열

4. Backend → Qdrant: 벡터 저장
   문서별 벡터 + 메타데이터(doc_id, tags, summary) 저장
   update인 경우 기존 벡터 교체

5. Backend → LLM: 엔티티/관계 추출
   입력: 각 문서의 body
   출력: 엔티티 목록 + 관계 목록

6. Backend → Neo4j: 그래프 저장
   엔티티 → 노드 생성/갱신
   관계 → 엣지 생성/갱신
   update인 경우 기존 노드/엣지 갱신

7. Backend → Supabase: 상태 갱신
   성공: ingestion_status = completed
   실패: pending 유지 → 다음 배치에서 자동 재시도

8. pending 재확인 → 있으면 1로 복귀
```

### 실패 처리

- **부분 실패**: 배치 내 일부 문서만 실패 시, 성공한 문서는 `completed`, 실패한 문서는 `pending` 유지. 다음 배치에서 자동 재시도
- **전체 실패**: API 장애 등으로 전체 실패 시 모든 문서 `pending` 유지. 장애 복구 후 다음 트리거에서 재처리
- **반복 실패 방지**: 동일 문서가 연속 N회 이상 실패하면 `failed` 상태로 전환하고 로그 기록. 수동 확인 후 재시도

### 향후 고려사항

- **인제스천 모니터링**: 배치 처리 시간, 실패율, pending 체류 시간 추적. 사용자 수 증가 시 병목 조기 감지
- **임베딩 모델 교체**: 모델 변경 시 전체 문서 재임베딩 필요. `ingestion_status`를 일괄 `pending`으로 전환하면 기존 배치 메커니즘으로 처리 가능

---

## 5. 상태 및 세션 관리

대화 이력, 드래프트 상태, Phase 전환에 필요한 정보를 세션 단위로 관리한다.

### 세션 스키마 (Supabase)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | 세션 고유 식별자 |
| `title` | string | Phase 1 첫 LLM 호출 시 `session_title`로 생성. 세션 목록에서 식별용 |
| `messages` | jsonb | 메시지 배열 (사용자 입력 + LLM 응답, 순서 보존). 채팅 UI 대화 이력 표시 + 향후 분석(실패 쿼리 패턴 수집 등)에 활용 |
| `draft` | jsonb \| null | 현재 작성 중인 드래프트. 저장/취소 시 null. 하위 필드: `body` (string, 정제된 본문), `similar_doc_ids` (uuid[], 유사 문서 ID 목록. Phase 2에서 최신 원본 조회용) |
| `document_ids` | uuid[] | 이 세션에서 저장된 문서 ID 목록. 세션 ↔ 문서 연결 |
| `user_id` | uuid | 소유자 (Supabase Auth) |
| `created_at` | timestamp | 세션 시작 시각 |
| `updated_at` | timestamp | 마지막 활동 시각 |

### 세션 제목 생성

세션의 **첫 번째 턴에서** 제목을 생성한다. Intent에 따라 생성 주체가 다르다:

- **첫 턴이 put-in**: Phase 1 LLM 호출 시 본문 정제와 함께 `session_title` 생성. 추가 LLM 호출 없이 기존 호출에 포함
- **첫 턴이 pull-out**: Intent Router + Query Planner LLM 호출 시 `session_title`을 함께 생성. 질문 내용 기반

이후 턴에서는 갱신하지 않는다. 문서 저장 여부와 무관하게 동작하므로, 저장 없이 이탈한 세션도 제목을 가진다.

### 세션과 Phase 전환

세션 스키마가 Phase 전환에 필요한 모든 상태를 담고 있으므로 별도 상태 관리가 불필요하다.

| Phase 전환 | 동작 |
|---|---|
| 세션 시작 | 첫 입력 → Intent Router 판정 → put-in이면 Phase 1, pull-out이면 Pull-out 흐름 |
| Phase 1 시작 | 세션 생성 (첫 입력) 또는 기존 세션 이어가기 |
| Phase 1 → Phase 2 | `draft` 유지한 채 Phase 2 시작. `draft.body`와 `draft.similar_doc_ids`를 Phase 2에서 참조 |
| Phase 2 DB 기록 성공 (4-5) | `document_ids`에 저장된 문서 ID 추가, `draft`를 null로 초기화 |
| Phase 2 실패 (4-5 이전) | `draft` 유지 → 재시도 시 body를 `draft`에서 복구 |
| 드래프트 활성 중 pull-out | `draft` 유지. pull-out 답변은 `messages`에 기록. 드래프트에 영향 없음 |
| 저장/취소 후 새 입력 | 같은 세션에서 Intent Router부터 재시작. `draft`에 새 드래프트 저장 또는 pull-out 처리 |

### 드래프트 임시 저장

드래프트는 서버(Supabase 세션 테이블)에 저장한다. 브라우저 새로고침, 탭 종료, 기기 변경 시에도 작성 중인 드래프트가 유지된다.

드래프트 갱신 시점:
- Phase 1 LLM 응답 수신 시: `draft.body` 갱신
- 유사 문서 검색 완료 시: `draft.similar_doc_ids` 갱신
- Phase 2 DB 기록 성공 시 (4-5): `draft` → null
- 취소 시: `draft` → null

`draft`는 Phase 2 진행 중에도 유지된다. DB 기록 성공 전에 실패하면 `draft`에서 body를 복구하여 재시도할 수 있다.

### 사용 패턴 분석

세션에 별도 status 필드를 두지 않는다. 대신 기존 필드 조합으로 사후 분석한다.

| 분석 항목 | 방법 |
|---|---|
| 저장 완료 세션 | `document_ids` 길이 > 0 |
| 이탈 세션 | `document_ids` 비어있고, `draft`가 null이 아님 (또는 `updated_at` 이후 장시간 비활성) |
| 취소 세션 | `document_ids` 비어있고, `draft`가 null |
| 수정 빈도 | `messages` 배열에서 수정 요청 메시지 수 카운트 |

---

## 6. Pull-out 흐름

저장된 지식을 검색하고 답변을 생성하는 흐름. Put-in(Phase 1→2→3)과 동일한 채팅 인터페이스에서 동작하며, 사용자는 흐름 전환을 의식하지 않는다.

### 설계 원칙

- **단일 인터페이스**: Put-in과 Pull-out을 별도 UI로 나누지 않는다. 사용자는 같은 채팅창에 입력하고, 시스템이 의도를 판단한다
- **내 지식만 답변**: LLM의 일반 지식으로 답변하지 않는다. 검색 결과가 없으면 "관련 문서가 없습니다"로 응답한다
- **답변은 채팅 버블**: 드래프트 카드는 "구조화 중인 지식"(put-in)에만 사용한다. Pull-out 답변을 카드로 분리하면 카드의 의미가 희석된다

### Intent Router + Query Planner

매 턴마다 사용자 입력의 의도를 판단하고, pull-out일 경우 검색 쿼리를 함께 생성한다. **단일 LLM 호출**로 처리한다.

#### 드래프트 비활성 시 (2분기)

| 판정 | 후속 흐름 |
|---|---|
| put-in | Phase 1 (드래프팅) |
| pull-out | Pull-out 검색 → 답변 생성 |

#### 드래프트 활성 시 (3분기)

| 판정 | 후속 흐름 |
|---|---|
| 수정 요청 | Phase 1 재호출 → 드래프트 카드 업데이트 |
| pull-out | Pull-out 검색 → 채팅 버블 (드래프트 카드 유지) |
| 저장 / 취소 | Phase 2 전환 또는 드래프트 폐기 |

#### 출력 스키마

```json
// put-in
{ "intent": "put-in", "queries": null, "entities": null }

// pull-out
{
  "intent": "pull-out",
  "queries": ["프론트엔드 시니어 면접", "커뮤니케이션 평가", "기술 면접 피드백"],
  "entities": ["프론트엔드", "시니어 채용"]
}

// 드래프트 활성 시 수정 요청
{ "intent": "edit", "queries": null, "entities": null }

// 드래프트 활성 시 저장/취소
{ "intent": "save", "queries": null, "entities": null }
{ "intent": "cancel", "queries": null, "entities": null }
```

#### Intent Router의 경계

| 아는 것 | 모르는 것 |
|---|---|
| 사용자 입력 텍스트 | DB 상태, 기존 문서 |
| 대화 이력 (이전 턴들) | 검색 결과 |
| 드래프트 활성 여부 | |

#### 멀티 쿼리 생성

문서가 많아지면 단일 쿼리로는 질문의 여러 측면을 커버하지 못한다. "프론트엔드 시니어 면접 커뮤니케이션 평가"를 단일 임베딩으로 검색하면 "프론트엔드 면접" 쪽만 상위에 올라오고 "커뮤니케이션 평가 기준" 관련 문서는 밀릴 수 있다.

LLM이 질문을 여러 검색 쿼리로 분해하여 각각의 측면을 독립적으로 검색한다. 동시에 그래프 탐색 진입점이 될 엔티티 키워드도 추출한다.

### 흐름

```
1. User → Frontend: 질문 입력
   "프론트엔드 시니어 면접 어떻게 됐었지?"

2. Frontend → Backend: 사용자 입력 전달

3. Backend → LLM: Intent Router + Query Planner
   입력: 사용자 질문 + 대화 이력 + 드래프트 활성 여부
   출력: { intent: "pull-out", queries: [...], entities: [...] }

4. Backend → 병렬 검색:
   a) Qdrant: queries 각각에 대해 시맨틱 검색 → 유사 청크 top-K
   b) Neo4j: entities로 엔티티 임베딩 매칭 → 관련 엔티티 → 연결된 문서
   c) Supabase: pending 문서 중 tags/summary/title 텍스트 매칭

5. Backend: 결과 합산 + 중복 제거 + 스코어 기반 정렬

6. Backend → LLM: 답변 생성
   입력: 원래 질문 + 대화 이력 + 검색 결과 (청크 + 문서 메타)
   출력: 답변 텍스트 + 참조 문서 ID 목록

7. Backend → Frontend: 답변 전달

8. Frontend → User: 채팅 버블 표시
   - 답변 본문
   - 출처 문서 링크 목록 (클릭 시 문서 전문 보기)
```

### Pull-out LLM의 경계 (답변 생성, 단계 6)

| 아는 것 | 모르는 것 |
|---|---|
| 사용자 질문 + 대화 이력 | 검색에 포함되지 않은 문서 |
| Backend가 전달한 검색 결과 | DB 전체 상태 |

검색 결과 범위 안에서만 답변한다. 검색 결과에 없는 내용을 LLM의 일반 지식으로 보충하지 않는다.

### 검색 전략

#### 3개 저장소 병렬 검색

| 저장소 | 검색 방식 | 역할 |
|---|---|---|
| **Qdrant** | 쿼리별 임베딩 → 시맨틱 유사도 | 의미 기반 문서 청크 검색. 주력 |
| **Neo4j** | 엔티티 임베딩 매칭 → 그래프 탐색 | 엔티티 관계를 통한 간접 연결 문서 발견. Qdrant가 놓치는 관계 기반 문서를 보강 |
| **Supabase** | tags/summary/title 텍스트 매칭 | 인제스천 미완료(pending) 문서 폴백. 방금 저장한 문서가 검색에서 빠지는 것을 방지 |

병렬 실행하여 레이턴시는 가장 느린 저장소 하나에 수렴한다.

#### Supabase 폴백 조건

`ingestion_status = pending`인 문서가 존재할 때만 Supabase 폴백 검색을 실행한다. 모든 문서가 `completed`이면 Qdrant + Neo4j만으로 충분하다.

#### 결과 합산

- 같은 문서가 여러 저장소에서 잡히면 중복 제거 (document ID 기준)
- 스코어 기반 정렬: Qdrant 유사도 스코어 기준으로 상위 문서 선정
- Neo4j 결과는 스코어가 없으므로, Qdrant 결과에 포함되지 않은 문서만 보강으로 추가
- Supabase 폴백 결과는 최하위 우선순위로 추가 (시맨틱 매칭이 아니므로 정확도 낮음)

### 검색 결과 없음

검색 결과가 없으면 LLM에 답변 생성을 요청하지 않는다.

```
Backend: 검색 결과 0건 확인
→ Frontend: "관련 문서가 없습니다" 메시지 표시
```

> **향후 고려사항: "누구에게 물어보세요" 제안**
>
> 멀티유저 소유권 모델(created_by + contributors[]) 도입 후, 질문 주제와 관련된 문서의 소유자/기여자를 추천할 수 있다. "이 주제에 대해 OO님에게 물어보세요." MVP에서는 단일 유저이므로 해당 없음.

### 출처 표시

답변 버블 하단에 참조 문서 목록을 표시한다.

| 요소 | 내용 |
|---|---|
| 문서 제목 | 클릭 가능한 링크 |
| 클릭 시 | 문서 전문 보기 (별도 뷰) |

출처 문서가 여러 개인 경우 답변 내에서의 참조 순서대로 나열한다.

### 향후 고려사항

- **후속 질문 제안**: 답변 생성 시 LLM이 관련 후속 질문 2-3개를 함께 생성. 사용자가 지식 탐색을 이어가도록 유도
- **답변 품질 피드백**: 답변 버블에 유용/비유용 버튼. 검색 품질과 답변 품질 개선에 활용
- **검색 결과 시각화**: 답변 근거가 된 문서 간 관계를 그래프로 시각화. Neo4j 데이터가 충분히 쌓인 후 도입
