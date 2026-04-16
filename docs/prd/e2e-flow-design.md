# Nema 구조화 엔진 — End-to-End 흐름 설계

## 목적

사용자 입력이 구조화된 지식으로 저장(Put-in)되고, 저장된 지식을 검색하여 답변(Pull-out)하기까지의 전체 흐름을 단계별로 명세한다. 각 단계에서 누가(Frontend, Backend, LLM, DB) 무엇을 하고, 어떤 데이터가 오가는지를 확정해서 하위 레이어(LLM 추상화, 임베딩 파이프라인, API 통합) 설계의 기반을 만든다.

## 용어 정의

| 용어 | 설명 |
|---|---|
| **Memory (기억)** | 주제/엔티티별 합성 문서. 새 정보가 들어올 때마다 증분 업데이트됨 |
| **Revision (히스토리)** | Memory의 각 업데이트 기록 (`memory_revisions` 테이블) |
| **update** | 기존 내용 대체 ("React 쓴다" → "Svelte로 전환") |
| **extend** | 기존 내용에 추가 ("Stripe PM" + "결제 인프라 팀 리드") |
| **세션** | raw 대화 원본. 별도 원본 문서 없이 여기서 보존 |
| **fan-out** | 하나의 저장이 여러 Memory를 동시 업데이트하는 것 |

## 목차

1. [구성 요소 정의](#1-구성-요소-정의) — 흐름에 참여하는 주체와 책임 경계
2. [Phase 1: 드래프팅](#2-phase-1-드래프팅) — Intent Router → put-in 판정 → LLM 본문 정제 → body만 표시 → 수정/pull-out/저장/취소
3. [Phase 2: 저장](#3-phase-2-저장) — 저장 트리거 → 멀티 토픽 분리 → 관련 Memory 검색 → 증분 업데이트/신규 생성 → diff 기록 → DB 기록
4. [Phase 3: 비동기 인제스천](#4-phase-3-비동기-인제스천) — 임베딩 생성 (Qdrant) + 그래프 노드/엣지 생성 (Neo4j). 완료 후 Phase 4 트리거
5. [Phase 4: Memory 재생성](#5-phase-4-memory-재생성) — 엔티티 기반 fan-out → 영향받는 Memory 검색 → 재생성 큐
6. [상태 및 세션 관리](#6-상태-및-세션-관리) — 대화 상태 유지, 드래프트 임시 저장, Phase 전환 시점, 대화 이력 저장
7. [Pull-out 흐름](#7-pull-out-흐름) — Memory 전용 검색(1차) + 기존 검색(폴백) → 답변 생성

---

## 1. 구성 요소 정의

이 흐름에 참여하는 주체와 각각의 책임 경계.

### 주체별 역할

| 주체 | 정체 | 책임 | 하지 않는 것 |
|---|---|---|---|
| **User** | 사용자 | 텍스트 입력, 저장/취소 트리거 (자연어 또는 인라인 버튼), 예외적으로 채팅 수정 요청 | 구조화 판단, 분류, 메타 필드 직접 편집 |
| **Frontend** | React (Vite) | UI 렌더링, 사용자 입력 수집, 드래프트 카드 표시 (인라인 저장/취소 버튼), pull-out 답변 버블 표시 | LLM 직접 호출, DB 직접 접근 |
| **Backend** | Fastify + tRPC | 흐름 오케스트레이션, 외부 서비스 호출 순서 제어, 입력 검증, 관련 Memory 검색 | 구조화 판단 (LLM 영역), 데이터 영속 (DB 영역) |
| **LLM** | Claude (교체 가능) | Intent 판단 + 검색 쿼리 생성 (Intent Router + Query Planner), 본문 정제 (Phase 1), title/tags/summary 생성 + create/update 판단 + 증분 업데이트 (Phase 2), 검색 결과 기반 답변 생성 (Pull-out), Memory 재생성 (Phase 4) | 데이터 저장, 검색, 상태 유지 |
| **Supabase** | PostgreSQL | Memory 저장 (source of truth), diff/revision 이력 저장, 세션 저장 | 의미 검색, 관계 탐색 |
| **Qdrant** | Vector DB | 임베딩 벡터 저장, 의미 유사도 검색 | 원본 저장, 관계 탐색 |
| **Neo4j** | Graph DB | 엔티티 간 관계 저장, 관계 탐색 (multi-hop), 영향받는 Memory 탐색 | 원본 저장, 의미 검색 |

### 통신 구조

#### 프로토콜

| 구간 | 프로토콜 |
|---|---|
| User ↔ Frontend | 브라우저 UI |
| Frontend ↔ Backend | tRPC (WebSocket or HTTP) |
| Backend → LLM | Anthropic API (HTTPS) |
| Backend → Supabase | Supabase Client SDK (HTTPS) |
| Backend → Qdrant | Qdrant REST API (HTTPS) |
| Backend → Neo4j | Neo4j Driver (Bolt) |
| Backend → Embedding API | Voyage AI API (HTTPS) |

#### 호출 방식 (사용자 대기 여부 기준)

| 구분 | 대상 | 의미 |
|---|---|---|
| **Blocking** | Intent Router + Query Planner LLM | 사용자가 응답을 기다림. Intent 판정 결과에 따라 후속 흐름 결정 |
| **Blocking** | Phase 1 LLM | 사용자가 응답을 기다림. 본문 정제 결과를 받아야 드래프트 카드 표시 가능 |
| **Blocking** | Pull-out 답변 생성 LLM | 사용자가 응답을 기다림. 검색 결과 기반 답변을 받아야 채팅 버블 표시 가능 |
| **Non-blocking** | Phase 2 전체 (LLM, Supabase), Phase 3, Phase 4 | 사용자에게 먼저 입력을 반환하고 백그라운드에서 처리. 저장 큐 UI로 상태 표시 |

### 데이터 저장 원칙

- **단일 책임**: 각 저장소는 고유 역할만 수행. 관계 정보는 Neo4j에만, 벡터는 Qdrant에만
- **Supabase가 source of truth**: Memory 원본 + 메타데이터 + diff 이력. 나머지 저장소는 파생 데이터
- **파생 데이터 재생성 가능**: Qdrant, Neo4j 데이터는 Supabase 원본으로부터 재생성 가능해야 함
- **세션은 raw 원본**: 대화 원본은 세션에 보존. 별도 원본 문서 불필요

### 인제스천 전 Memory 검색 (폴백)

임베딩/그래프 저장은 Non-blocking이므로, 저장 직후 해당 Memory가 벡터 검색에 잡히지 않는 구간이 존재한다. 이때 Supabase에는 이미 본문 + 메타 필드가 저장 완료된 상태이므로, **Supabase 메타 필드(tags, summary)로 폴백 검색**한다. 상세 흐름은 Section 7(Pull-out 흐름)에서 다룬다.

### 향후 고려사항

- **Source of truth 백업 전략**: Supabase가 유일한 원본 저장소이므로 단일 장애점(SPOF). 사용자가 쌓은 맥락이 제품의 핵심 가치인 만큼, 사용자 수 증가 시 백업 방안(Point-in-Time Recovery, 주기적 스냅샷 등) 필수
- **벡터/그래프 DB 용량**: Memory 원본(Supabase)보다 Qdrant(Free 1GB), Neo4j(Free tier 노드 제한)가 먼저 한계에 도달. 사용자 수 증가 시 유료 전환 또는 셀프호스팅 검토 필요
- **MCP / CLI 확장**: 모든 오케스트레이션 로직이 Backend(tRPC)에 집중되어 있으므로, 프레젠테이션 레이어 추가로 대응 가능

---

## 2. Phase 1: 드래프팅

사용자 입력을 정제된 본문으로 변환하는 대화형 단계. Phase 1에서는 body만 생성하며, title/tags/summary는 Phase 2(저장 시점)에서 기존 Memory 컨텍스트와 함께 생성한다.

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
   Backend → 관련 Memory 검색 (백그라운드, Non-blocking, body 텍스트 기반)

4. Frontend → User: 드래프트 카드 표시
   - 정제된 body만 표시
   - 인라인 버튼: 저장, 취소
   - 관련 Memory 검색 완료 시 → 드래프트 카드 옆에 관련 Memory 힌트 표시

5. [드래프트 활성 중 — 반복 가능]
   User → Frontend: 채팅 입력
   → Intent Router 판정:
     수정 요청 ("좀 더 자세히 써줘", "톤이 너무 딱딱해")
       → 진행 중인 관련 Memory 검색 abort
       → 1~4 반복 (이전 드래프트 + 수정 요청을 LLM에 전달)
     pull-out ("저번에 본 시니어는 어땠지?")
       → Pull-out 흐름 (Section 7) → 채팅 버블로 답변, 드래프트 카드 유지
     저장 ("저장해", 저장 버튼 클릭)
       → Phase 2로 전환
     취소 ("취소해줘", 취소 버튼 클릭)
       → 드래프트 폐기, 입력 대기 상태로 복귀
```

### Phase 1 LLM의 경계

| 아는 것 | 모르는 것 |
|---|---|
| 정제 규칙 (본문 품질 기준) | 사용자의 기존 Memory |
| 현재 대화 맥락 (이전 드래프트 + 수정 요청) | 기존 태그 목록, DB 상태 |

Phase 1 LLM은 **본문 정제만** 수행한다. title, tags, summary 생성과 기존 Memory 인식, create/update 판단은 전적으로 Phase 2의 영역이다.

단, **관련 Memory 조기 인지**는 LLM이 아닌 Backend가 담당한다. 드래프트 생성 후 Backend가 백그라운드로 body 텍스트 기반 관련 Memory를 검색하여 Frontend에 힌트로 전달한다.

### Phase 1 드래프트 출력

| 필드 | 타입 | 설명 |
|---|---|---|
| `body` | string | 정제된 본문. 원래 의미 100% 보존 (강도 포함). 사용자가 말하지 않은 내용 추가 금지 |
| `session_title` | string | 세션 제목 (첫 번째 호출에서만 생성, 수정 사이클에서는 미갱신) |

title, tags, summary는 Phase 2에서 기존 Memory 컨텍스트(기존 태그 풀, 관련 Memory)와 함께 생성한다.

> **결정 기록: Phase 1 출력을 body만으로 축소**
>
> - **근거**: 사용자는 정제된 본문만 확인하면 되고, 나머지 메타 필드는 관심사가 아님. 저장 시점에 기존 Memory 컨텍스트를 활용하면 메타 필드 품질도 더 높아짐
> - **이점**: Phase 1 LLM 호출이 단순해지고, 드래프트 카드 UI도 body만 표시하면 됨

> **결정 기록: `category` 필드 — 스키마 선반영, 그룹핑 UI는 추후**
>
> - **원래 목적**: 폴더 트리 UI에서 Memory를 계층 탐색하기 위한 경로
> - **선반영 근거**: Memory 관리 뷰(개괄 보기, 스페이스 구분)가 필요하다는 판단. 나중에 백필하는 것보다 Phase 2 LLM이 저장 시점에 함께 채우는 것이 데이터 품질에 유리
> - **추후 구현**: 그룹핑 로직, LLM 프롬프트(category 생성 규칙), 그룹핑 뷰 UI는 실제 구현 단계에서 설계

### 수정 사이클

첫 드래프트의 품질이 핵심이다. 수정 요청 시 Backend는 **이전 body + 수정 요청**을 함께 LLM에 전달하고, LLM은 수정이 반영된 새 body를 응답한다.

드래프트는 항상 단일 문서. 멀티 토픽 분리는 Phase 2에서 Backend가 처리한다.

---

## 3. Phase 2: 저장

사용자가 저장을 트리거한 시점부터 Supabase에 Memory가 기록되기까지의 흐름. Phase 1에서 생성된 body를 바탕으로 메타 필드 생성, 멀티 토픽 분리, 관련 Memory 검색, create/update 판단, 증분 업데이트, diff 기록을 수행한다.

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

4. [이하 body별로 반복 — 분리되지 않았으면 1회]

   4-1. Backend: 관련 Memory 검색 결과 확보
        - Phase 1 검색 완료 + 분리 안 됨: 결과 재사용 (검색 절약)
        - Phase 1 검색 미완료 (즉시 저장 등): Phase 2에서 직접 검색
        - 멀티 토픽 분리됨: 분리된 각 body별로 Phase 2에서 직접 검색
        저장 버튼은 Phase 1 검색 완료 후 활성화하여 대부분 재사용 경로를 탐

   4-2. Backend → Supabase: 기존 태그 풀 조회

   4-3. Backend → LLM: 메타 필드 생성 + create/update 판단
        입력: body + 관련 Memory 목록 + 기존 태그 풀
        판단: 관련 Memory와 주제 범위가 일치하는가?
          → 주제 범위 밖 또는 관련 Memory 없음: create
          → 주제 범위 안: update (extend 또는 replace)

        create 출력:
        {
          "title": "Senior Frontend Interview Feedback",
          "tags": ["hiring", "frontend", "senior", "interview"],
          "summary": "Senior frontend interview — tech skills adequate, communication somewhat lacking",
          "action": "create",
          "body": "..."  // 확정된 본문
        }

        update 출력 (fan-out: 복수의 target_id 가능):
        [
          {
            "title": "Senior Frontend Interview Feedback",
            "tags": ["hiring", "frontend", "senior", "interview"],
            "summary": "...",
            "action": "update",
            "update_type": "extend" | "replace",
            "target_id": "existing_memory_id",
            "updated_body": "기존 body + 새 정보를 증분 업데이트한 본문"
          },
          ...
        ]

   4-4. Backend → Supabase: DB 기록
        create → memories 테이블에 새 행 삽입 (title, tags, summary, body)
        update → 기존 행 갱신 (updated_body로 교체, ingestion_status = pending)

   4-5. Backend → Supabase: diff 기록
        update 시 memory_revisions 테이블에 revision 삽입
        {
          "memory_id": "...",
          "prev_body": "갱신 전 본문",
          "next_body": "갱신 후 본문",
          "update_type": "extend" | "replace",
          "source_session_id": "...",
          "created_at": "..."
        }
        create 시에도 최초 revision 기록 (prev_body = null)
        상세 스키마 설계: NEM-85에 위임

5. Backend → Frontend: 저장 완료 응답

6. Frontend: 저장 큐 UI 상태 전환
   성공 → 완료 표시 (일정 시간 후 자동 사라짐)
   실패 → 에러 표시 + 드래프트 복구 + 재시도 버튼

7. → Phase 3 (비동기 인제스천) 트리거
```

### Phase 2 LLM의 경계

| 아는 것 | 모르는 것 |
|---|---|
| Phase 1에서 확정된 body | 사용자의 의도 (create vs update 선호) |
| 관련 Memory 목록 (Backend가 검색해서 전달) | 임베딩/그래프 상태 |
| 기존 태그 풀 | |
| 기존 Memory 원본 (update 판단 시) | |

### Memory 스키마 (Supabase 기록 시점)

| 필드 | 타입 | 생성 주체 | 설명 |
|---|---|---|---|
| `id` | uuid | 시스템 | Memory 고유 식별자 |
| `title` | string | Phase 2 LLM | 소프트 앵커: 3-8 단어 지향 |
| `tags` | string[] | Phase 2 LLM | 소프트 앵커: 3-7개 지향. 기존 태그 풀과 수렴 |
| `summary` | string | Phase 2 LLM | 소프트 앵커: 1-2문장 지향 |
| `body` | string | Phase 1 LLM (create) 또는 Phase 2 LLM (update 시 updated_body) | 최신 본문 |
| `created_at` | timestamp | 시스템 | 최초 생성 시각 |
| `updated_at` | timestamp | 시스템 | 최종 수정 시각 |
| `user_id` | uuid | 시스템 | 소유자 (Supabase Auth) |
| `category` | string | Phase 2 LLM | 분류 경로. 스키마 선반영, 그룹핑 로직/뷰는 추후 구현 |
| `ingestion_status` | enum | 시스템 | `pending` (저장/수정 시) → `completed` (인제스천 완료 시) → `failed` (반복 실패 시) |

> 소프트 앵커는 LLM 프롬프트에 수치를 명시하되 시스템 검증으로 강제하지 않는다.

### create/update 판단 — 주제 범위 게이트

LLM이 관련 Memory 목록을 받고, 새 body가 기존 Memory의 **주제 범위 안에 있는지**를 기준으로 판단한다:

- **create**: 관련 Memory가 없거나, 있더라도 주제 범위 밖인 경우
- **update**: 관련 Memory 중 동일 주제를 다루고, 새 body가 해당 Memory의 보완/확장인 경우

update 시 LLM은 기존 body와 새 body를 **증분 업데이트**(단순 append가 아닌 맥락 이해 기반 재작성)한다.

update_type:
- **extend**: 기존 내용을 유지하면서 새 정보를 추가 ("Stripe PM" + "결제 인프라 팀 리드")
- **replace**: 기존 내용을 새 내용으로 대체 ("React 쓴다" → "Svelte로 전환")

### Fan-out

하나의 저장이 여러 Memory를 대상으로 update를 트리거할 수 있다. (예: "이직했고 팀도 바뀌었다" → 직업 Memory + 팀 관계 Memory 동시 update)

동일 Memory에 동시 업데이트가 발생하는 경우 순서 보장이 필요하다. 처리 방식은 NEM-88에 위임.

### 멀티 토픽 분리

사용자 입력이 독립적인 2개 이상의 주제를 포함할 때 Backend가 LLM에 분리를 요청한다. 분리된 각 body는 4-1부터 독립적으로 처리된다.

- 분리 판단은 **보수적으로**: 애매하면 단일 문서 유지
- 분리된 중 일부 저장이 실패해도 성공한 것은 유지 (부분 실패 허용)

### 동시 저장 처리

Phase 1(드래프팅)은 저장 중에도 새 입력을 즉시 시작할 수 있다. Phase 2(저장)는 **큐로 순차 처리**한다.

```
Phase 1: 병렬 가능 — 저장 중에도 새 드래프팅 즉시 시작
Phase 2: 큐 — 앞선 저장 완료 후 다음 저장 시작
```

### 저장 큐 UI

| 상태 | 표시 | 사용자 액션 |
|---|---|---|
| **로딩** | 저장 진행 중 인디케이터 | 없음 (새 입력은 가능) |
| **완료** | 완료 표시, 일정 시간 후 자동 사라짐 | 없음 |
| **실패** | 에러 표시 + 드래프트 내용 보존 | 재시도 버튼으로 Phase 2 재실행 |

### 향후 고려사항

- **Diff 리뷰 플로우**: 4-4/4-5(DB 기록) 전에 사용자 확인 단계 삽입. update 시 "기존 body vs updated_body" 비교, create 시 title/tags/summary 확인. 사용자가 승인하면 DB 기록, 수정 요청하면 LLM 재처리
- **멀티유저 소유권 모델**: `user_id`를 확장하여 Memory 단위(created_by + contributors[]) 추적

---

## 4. Phase 3: 비동기 인제스천

Supabase에 저장된 Memory를 임베딩(Qdrant) + 그래프(Neo4j)로 변환하는 배치 처리 단계. Phase 2 완료 즉시가 아니라, 누적된 pending Memory를 배치로 처리한다. 완료 후 Phase 4를 트리거한다.

### 왜 배치인가

- 인제스천은 외부 API 호출(임베딩 생성, 엔티티 추출)을 포함하여 처리 시간이 길다
- 건별 즉시 실행 시 race condition 발생
- 폴백 검색(Supabase 메타 필드)이 인제스천 미완료 구간을 메워주므로 즉시성 불필요

### 인제스천 상태 관리

Supabase Memory 테이블의 `ingestion_status` 필드로 관리한다.

| 상태 | 의미 | 전환 시점 |
|---|---|---|
| `pending` | 인제스천 대기 | Phase 2 저장/수정 시 항상 설정 |
| `completed` | 인제스천 완료 | 배치 처리 성공 시 |
| `failed` | 반복 실패 | 연속 N회 실패 시 (수동 확인 필요) |

Phase 2가 Memory를 저장/수정할 때 **항상 `pending`으로 덮어쓴다.**

### 배치 트리거

인제스천 완료 후 pending 순환 방식. 별도 스케줄러나 크론 불필요.

```
Phase 2 저장 완료 → ingestion_status = pending
  → 현재 인제스천 실행 중이 아니면 배치 시작

배치 실행:
  1. pending Memory 전체 수집
  2. 임베딩 생성 (Voyage AI) → Qdrant 저장
  3. 엔티티/관계 추출 (LLM) → Neo4j 저장
  4. 성공한 Memory: ingestion_status = completed
     실패한 Memory: pending 유지
  5. 배치 완료 → pending 재확인
     → pending 있음: 즉시 다음 배치
     → pending 없음: 대기 (다음 Phase 2 저장이 트리거)
  6. 배치 완료 → Phase 4 트리거
```

### 흐름

```
1. 트리거: Phase 2 저장 완료 시 pending 확인, 또는 이전 배치 완료 후 pending 확인

2. Backend → Supabase: pending Memory 수집
   SELECT * FROM memories WHERE ingestion_status = 'pending'

3. Backend → Voyage AI: 임베딩 생성 (배치 API)
   입력: 각 Memory의 body
   출력: 벡터 배열

4. Backend → Qdrant: 벡터 저장
   Memory별 벡터 + 메타데이터(memory_id, tags, summary) 저장
   update인 경우 기존 벡터 교체

5. Backend → LLM: 엔티티/관계 추출
   입력: 각 Memory의 body
   출력: 엔티티 목록 + 관계 목록

6. Backend → Neo4j: 그래프 저장
   엔티티 → 노드 생성/갱신
   관계 → 엣지 생성/갱신

7. Backend → Supabase: 상태 갱신
   성공: ingestion_status = completed
   실패: pending 유지

8. pending 재확인 → 있으면 1로 복귀

9. 배치 완료 → Phase 4 트리거
```

---

## 5. Phase 4: Memory 재생성

Phase 3에서 추출된 엔티티/관계를 기반으로 영향받는 Memory를 탐색하고, 재생성이 필요한 Memory를 큐에 올린다.

### 목적

새 Memory가 추가되거나 기존 Memory가 업데이트되면, 같은 엔티티를 공유하는 다른 Memory들이 outdated될 수 있다. Phase 4는 이를 감지하여 관련 Memory를 최신 컨텍스트로 재합성한다.

### 흐름

```
1. 트리거: Phase 3 배치 완료

2. Backend → Neo4j: 이번 배치에서 변경된 엔티티와 연결된 Memory 탐색
   입력: Phase 3에서 처리된 Memory ID 목록
   출력: 영향받는 Memory ID 목록 (같은 엔티티를 참조하는 다른 Memory)

3. Backend: 재생성 큐에 추가
   - 이미 큐에 있는 Memory는 중복 추가하지 않음
   - 방금 Phase 3에서 처리된 Memory 자신은 제외

4. Backend → LLM: 큐의 Memory 순차 재생성
   입력: 기존 Memory body + 관련 엔티티 컨텍스트 (Neo4j에서 조회)
   출력: 재합성된 body

5. Backend → Supabase: 재생성된 Memory 저장 + diff 기록 (4-4, 4-5와 동일)
   ingestion_status = pending → Phase 3 재트리거

6. Phase 3 재트리거 → 재생성된 Memory 인제스천
```

### 동일 Memory 동시 업데이트

Phase 4 fan-out 과정에서 동일 Memory에 동시 업데이트가 발생하는 경우 순서 보장이 필요하다. 처리 방식은 NEM-88에 위임.

### 향후 고려사항

- **재생성 깊이 제한**: Phase 4 → Phase 3 → Phase 4 순환 가능. 재생성 체인이 과도하게 깊어지지 않도록 최대 깊이(hop) 제한 필요
- **재생성 우선순위**: 최근 접근된 Memory, 자주 참조된 Memory를 우선 재생성

---

## 6. 상태 및 세션 관리

대화 이력, 드래프트 상태, Phase 전환에 필요한 정보를 세션 단위로 관리한다.

### 세션 스키마 (Supabase)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | 세션 고유 식별자 |
| `title` | string | Phase 1 첫 LLM 호출 시 `session_title`로 생성. 세션 목록에서 식별용 |
| `messages` | jsonb | 메시지 배열 (사용자 입력 + LLM 응답, 순서 보존). 채팅 UI 대화 이력 표시 + 향후 분석에 활용 |
| `draft` | jsonb \| null | 현재 작성 중인 드래프트. 저장/취소 시 null. 하위 필드: `body` (string), `similar_memory_ids` (uuid[]) |
| `memory_ids` | uuid[] | 이 세션에서 저장된 Memory ID 목록. 세션 ↔ Memory 연결 |
| `user_id` | uuid | 소유자 (Supabase Auth) |
| `created_at` | timestamp | 세션 시작 시각 |
| `updated_at` | timestamp | 마지막 활동 시각 |

세션은 raw 대화 원본의 보존 단위이다. 별도 원본 Memory 불필요.

### 세션 제목 생성

세션의 **첫 번째 턴에서** 제목을 생성한다:

- **첫 턴이 put-in**: Phase 1 LLM 호출 시 `session_title` 함께 생성
- **첫 턴이 pull-out**: Intent Router + Query Planner LLM 호출 시 `session_title` 함께 생성

이후 턴에서는 갱신하지 않는다.

### 세션과 Phase 전환

| Phase 전환 | 동작 |
|---|---|
| 세션 시작 | 첫 입력 → Intent Router 판정 → put-in이면 Phase 1, pull-out이면 Pull-out 흐름 |
| Phase 1 → Phase 2 | `draft` 유지한 채 Phase 2 시작. `draft.body`와 `draft.similar_memory_ids`를 Phase 2에서 참조 |
| Phase 2 DB 기록 성공 | `memory_ids`에 저장된 Memory ID 추가, `draft`를 null로 초기화 |
| Phase 2 실패 | `draft` 유지 → 재시도 시 body를 `draft`에서 복구 |
| 드래프트 활성 중 pull-out | `draft` 유지. pull-out 답변은 `messages`에 기록. 드래프트에 영향 없음 |

### 드래프트 임시 저장

드래프트는 서버(Supabase 세션 테이블)에 저장한다. 브라우저 새로고침, 탭 종료, 기기 변경 시에도 유지된다.

드래프트 갱신 시점:
- Phase 1 LLM 응답 수신 시: `draft.body` 갱신
- 관련 Memory 검색 완료 시: `draft.similar_memory_ids` 갱신
- Phase 2 DB 기록 성공 시: `draft` → null
- 취소 시: `draft` → null

---

## 7. Pull-out 흐름

저장된 Memory를 검색하고 답변을 생성하는 흐름. Put-in(Phase 1→2→3→4)과 동일한 채팅 인터페이스에서 동작한다.

### 설계 원칙

- **단일 인터페이스**: Put-in과 Pull-out을 별도 UI로 나누지 않는다. 시스템이 의도를 판단한다
- **내 지식만 답변**: LLM의 일반 지식으로 답변하지 않는다. 검색 결과가 없으면 "관련 기억이 없습니다"로 응답한다
- **답변은 채팅 버블**: 드래프트 카드는 put-in에만 사용한다

### Intent Router + Query Planner

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
  "queries": ["프론트엔드 시니어 면접", "커뮤니케이션 평가"],
  "entities": ["프론트엔드", "시니어 채용"]
}

// 드래프트 활성 시
{ "intent": "edit", "queries": null, "entities": null }
{ "intent": "save", "queries": null, "entities": null }
{ "intent": "cancel", "queries": null, "entities": null }
```

### 흐름

```
1. User → Frontend: 질문 입력

2. Frontend → Backend: 사용자 입력 전달

3. Backend → LLM: Intent Router + Query Planner
   출력: { intent: "pull-out", queries: [...], entities: [...] }

4. Backend → 병렬 검색:
   [1차: Memory 전용 검색]
   a) Qdrant: queries 각각에 대해 시맨틱 검색 → 유사 Memory top-K
   b) Neo4j: entities로 엔티티 임베딩 매칭 → 관련 엔티티 → 연결된 Memory

   [폴백: 인제스천 미완료 Memory]
   c) Supabase: pending Memory 중 tags/summary/title 텍스트 매칭
      (ingestion_status = pending인 Memory가 존재할 때만 실행)

5. Backend: 결과 합산 + 중복 제거 + 스코어 기반 정렬
   - Qdrant 유사도 스코어 기준으로 상위 Memory 선정
   - Neo4j 결과는 Qdrant에 없는 Memory만 보강으로 추가
   - Supabase 폴백은 최하위 우선순위 (시맨틱 매칭이 아니므로 정확도 낮음)

6. Backend → LLM: 답변 생성
   입력: 원래 질문 + 대화 이력 + 검색 결과 (Memory body + 메타)
   출력: 답변 텍스트 + 참조 Memory ID 목록

7. Backend → Frontend: 답변 전달

8. Frontend → User: 채팅 버블 표시
   - 답변 본문
   - 출처 Memory 링크 목록 (클릭 시 Memory 전문 보기)
```

### 검색 전략

Memory 전용 검색(1차)과 인제스천 미완료 폴백(2차)으로 구조적으로 분리한다.

| 레이어 | 저장소 | 검색 방식 | 역할 |
|---|---|---|---|
| **1차: Memory 검색** | Qdrant | 쿼리별 임베딩 → 시맨틱 유사도 | 의미 기반 Memory 검색. 주력 |
| **1차: Memory 검색** | Neo4j | 엔티티 임베딩 매칭 → 그래프 탐색 | Qdrant가 놓치는 관계 기반 Memory 보강 |
| **폴백** | Supabase | tags/summary/title 텍스트 매칭 | pending Memory 폴백. 방금 저장한 Memory가 검색에서 빠지는 것을 방지 |

Pull-out 검색 전략의 세부 구현은 NEM-89에 위임.

### 검색 결과 없음

```
Backend: 검색 결과 0건 확인
→ Frontend: "관련 기억이 없습니다" 메시지 표시
```

### 출처 표시

답변 버블 하단에 참조 Memory 목록을 표시한다. 클릭 시 Memory 전문 보기.

### 향후 고려사항

- **후속 질문 제안**: 답변 생성 시 LLM이 관련 후속 질문 2-3개 함께 생성
- **답변 품질 피드백**: 답변 버블에 유용/비유용 버튼
- **검색 결과 시각화**: 답변 근거가 된 Memory 간 관계를 그래프로 시각화
- **"누구에게 물어보세요" 제안**: 멀티유저 소유권 모델 도입 후 질문 주제 관련 Memory 소유자/기여자 추천
